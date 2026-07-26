#!/usr/bin/env Rscript
# Minimal local R kernel for the ZeroWall Science notebook.
#
# A persistent process that holds one environment across cells (shared state,
# like a Jupyter kernel). The host writes the cell's code to a file (argv[1]),
# then sends one line "<id>" on stdin; we evaluate that file in the global
# environment and write ONE JSON response line back to stdout:
#
#     response: {"id","ok","stdout","result","error","image","truncated"}\n
#
# Base R only — no jsonlite/IRkernel — so it runs against any R install,
# offline, with no model key. `result` mirrors Jupyter: the printed value of the
# cell's final expression when it is visible, else null. `image` is a base64 PNG
# when the cell drew a plot.
#
# `sink()` only captures R's own connections, so a cell calling system() hands
# the child the process's real stdout — the protocol stream. Those two calls are
# therefore shadowed for the duration of each cell and their output folded into
# the cell's own, so a shell command can never desynchronize the host.

args <- commandArgs(trailingOnly = TRUE)
codefile <- args[1]
options(warn = 1) # surface warnings inline (stdout), not deferred to session end

# Cap on one cell's captured output; matches the Python bridge.
MAX_OUTPUT_CHARS <- 200000L
MAX_IMAGE_BYTES <- 4000000L

# JSON-escape a scalar string. fixed = TRUE keeps replacements literal so we do
# not fight regex metacharacters; control chars left after \n\r\t are dropped.
json_escape <- function(s) {
  if (length(s) != 1) s <- paste(s, collapse = "\n")
  if (is.na(s)) return("")
  s <- gsub("\\", "\\\\", s, fixed = TRUE)
  s <- gsub("\"", "\\\"", s, fixed = TRUE)
  s <- gsub("\n", "\\n", s, fixed = TRUE)
  s <- gsub("\r", "\\r", s, fixed = TRUE)
  s <- gsub("\t", "\\t", s, fixed = TRUE)
  s <- gsub("[[:cntrl:]]", "", s)
  s
}

emit <- function(id, ok, out, result, error, image, truncated) {
  parts <- c(
    paste0("\"id\":\"", json_escape(id), "\""),
    paste0("\"ok\":", if (ok) "true" else "false"),
    paste0("\"stdout\":\"", json_escape(out), "\""),
    if (is.null(result)) "\"result\":null" else paste0("\"result\":\"", json_escape(result), "\""),
    if (is.null(error)) "\"error\":null" else paste0("\"error\":\"", json_escape(error), "\""),
    if (is.null(image)) "\"image\":null" else paste0("\"image\":\"", image, "\""),
    paste0("\"truncated\":", if (truncated) "true" else "false")
  )
  cat(paste0("{", paste(parts, collapse = ","), "}"), "\n", sep = "")
  flush(stdout())
}

# Clip captured output, keeping the head and the tail.
truncate_output <- function(text) {
  if (nchar(text) <= MAX_OUTPUT_CHARS) return(list(text = text, truncated = FALSE))
  keep <- MAX_OUTPUT_CHARS %/% 2L
  dropped <- nchar(text) - 2L * keep
  list(
    text = paste0(substr(text, 1L, keep),
                  "\n... [", dropped, " characters omitted] ...\n",
                  substr(text, nchar(text) - keep + 1L, nchar(text))),
    truncated = TRUE
  )
}

# Base64-encode raw bytes. Base R ships no base64 encoder (tools::base64encode
# arrived late and is absent from common installs, e.g. 4.3.x), and this file
# takes no package dependencies, so encode it directly: 3 bytes -> 4 chars,
# with the standard "=" tail padding.
base64_raw <- function(raw) {
  alphabet <- c(LETTERS, letters, 0:9, "+", "/")
  n <- length(raw)
  pad <- (3L - n %% 3L) %% 3L
  if (pad > 0L) raw <- c(raw, as.raw(rep(0L, pad)))
  v <- as.integer(raw)
  triples <- matrix(v, nrow = 3L)
  bits <- triples[1L, ] * 65536L + triples[2L, ] * 256L + triples[3L, ]
  chars <- rbind(
    alphabet[bits %/% 262144L + 1L],
    alphabet[(bits %/% 4096L) %% 64L + 1L],
    alphabet[(bits %/% 64L) %% 64L + 1L],
    alphabet[bits %% 64L + 1L]
  )
  out <- paste(chars, collapse = "")
  if (pad > 0L) {
    out <- paste0(substr(out, 1L, nchar(out) - pad), strrep("=", pad))
  }
  out
}

# Base64 PNG of whatever the cell drew, or NULL. Plotting goes to an offscreen
# PNG device opened per cell, so a plot() call produces a figure instead of
# silently going nowhere in a headless process.
capture_plot_png <- function(path) {
  if (!file.exists(path)) return(NULL)
  size <- file.info(path)$size
  if (is.na(size) || size == 0 || size > MAX_IMAGE_BYTES) return(NULL)
  tryCatch(base64_raw(readBin(path, "raw", n = size)), error = function(e) NULL)
}

run_cell <- function(code, plotfile) {
  exprs <- tryCatch(parse(text = code), error = function(e) e)
  if (inherits(exprs, "error")) {
    return(list(ok = FALSE, stdout = "", result = NULL,
                error = paste0("Error: ", conditionMessage(exprs)),
                image = NULL, truncated = FALSE))
  }
  captured <- character(0)
  buf <- textConnection("captured", open = "w", local = TRUE)

  # An offscreen device, so plot() draws a figure instead of failing or going
  # nowhere in a headless process. Absent graphics support is not an error:
  # the cell still runs, it just produces no image.
  unlink(plotfile)
  has_device <- tryCatch({
    grDevices::png(filename = plotfile, width = 800, height = 600, res = 110)
    TRUE
  }, error = function(e) FALSE, warning = function(w) FALSE)
  # An untouched device still writes a blank PNG on close. `dev.size` cannot
  # tell drawn from empty, so ask the display list: an empty one means the
  # cell drew nothing and the figure must be dropped, not shown as a white box.
  if (has_device) tryCatch(grDevices::dev.control("enable"), error = function(e) NULL)

  # system()/system2() bypass sink(): they hand the child the kernel's own
  # descriptors, so the child's output would arrive as a bare line between
  # responses and desynchronize the host. Shadow both for the duration of the
  # cell, routing the child through files.
  #
  # `intern = TRUE` is NOT usable here: on Windows it closes the kernel's
  # inherited stdin, so the read loop sees EOF and the kernel exits — a shell
  # command would silently end the session. Explicit file redirection with a
  # private stdin file leaves our descriptors untouched.
  run_child <- function(command, args) {
    outfile <- tempfile()
    infile <- tempfile()
    file.create(infile)
    on.exit(unlink(c(outfile, infile)), add = TRUE)
    status <- tryCatch(
      base::system2(command, args, stdout = outfile, stderr = outfile, stdin = infile),
      error = function(e) {
        cat("Error: ", conditionMessage(e), "\n", sep = "")
        127L
      }
    )
    if (file.exists(outfile)) {
      text <- readLines(outfile, warn = FALSE)
      if (length(text)) cat(paste(text, collapse = "\n"), "\n", sep = "")
    }
    invisible(if (is.numeric(status)) as.integer(status) else 0L)
  }
  # base::system() takes one command line; hand it to the shell so pipes and
  # redirection keep working.
  shell_cmd <- if (.Platform$OS.type == "windows") "cmd" else "/bin/sh"
  shell_flag <- if (.Platform$OS.type == "windows") "/c" else "-c"
  assign("system", function(command, ...) run_child(shell_cmd, c(shell_flag, shQuote(command))),
         envir = globalenv())
  assign("system2", function(command, args = character(), ...) run_child(command, args),
         envir = globalenv())

  sink(buf)
  sink(buf, type = "message")
  result <- NULL
  err <- NULL
  tryCatch({
    n <- length(exprs)
    if (n > 0) for (i in seq_len(n)) {
      wv <- withVisible(eval(exprs[[i]], envir = globalenv()))
      if (wv$visible) {
        printed <- paste(utils::capture.output(print(wv$value)), collapse = "\n")
        if (i == n) result <- printed else cat(printed, "\n", sep = "")
      }
    }
  }, error = function(e) {
    err <<- paste0("Error: ", conditionMessage(e))
  })
  sink(type = "message")
  sink()
  close(buf)
  # Ask the display list whether the cell actually drew: an untouched device
  # still writes a blank PNG, and a white box is not a figure.
  drew <- FALSE
  if (has_device) {
    drew <- tryCatch(length(grDevices::recordPlot()[[1]]) > 0L, error = function(e) FALSE)
    tryCatch(grDevices::dev.off(), error = function(e) NULL)
  }
  # Restore the real system()/system2() so a later cell defining its own is
  # not fighting a leftover shim.
  suppressWarnings(rm(list = c("system", "system2"), envir = globalenv()))

  image <- if (drew) capture_plot_png(plotfile) else NULL
  unlink(plotfile)
  clipped <- truncate_output(paste(captured, collapse = "\n"))
  list(ok = is.null(err), stdout = clipped$text, result = result, error = err,
       image = image, truncated = clipped$truncated)
}

con <- file("stdin", open = "r")
# Per-kernel scratch files, named off the code file so concurrent notebooks
# never share them.
plotfile <- paste0(codefile, ".png")
repeat {
  line <- readLines(con, n = 1)
  if (length(line) == 0) break # host closed stdin -> exit
  id <- trimws(line)
  if (nchar(id) == 0) next
  code <- tryCatch(paste(readLines(codefile, warn = FALSE), collapse = "\n"),
                   error = function(e) "")
  r <- run_cell(code, plotfile)
  emit(id, r$ok, r$stdout, r$result, r$error, r$image, r$truncated)
}
