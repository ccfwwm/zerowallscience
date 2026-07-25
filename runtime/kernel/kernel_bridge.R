#!/usr/bin/env Rscript
# Minimal local R kernel for the ZeroWall Science notebook.
#
# A persistent process that holds one environment across cells (shared state,
# like a Jupyter kernel). The host writes the cell's code to a file (argv[1]),
# then sends one line "<id>" on stdin; we evaluate that file in the global
# environment and write ONE JSON response line back to stdout:
#
#     response: {"id","ok","stdout","result","error"}\n
#
# Base R only — no jsonlite/IRkernel — so it runs against any R install,
# offline, with no model key. `result` mirrors Jupyter: the printed value of the
# cell's final expression when it is visible, else null.

args <- commandArgs(trailingOnly = TRUE)
codefile <- args[1]
options(warn = 1) # surface warnings inline (stdout), not deferred to session end

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

emit <- function(id, ok, out, result, error) {
  parts <- c(
    paste0("\"id\":\"", json_escape(id), "\""),
    paste0("\"ok\":", if (ok) "true" else "false"),
    paste0("\"stdout\":\"", json_escape(out), "\""),
    if (is.null(result)) "\"result\":null" else paste0("\"result\":\"", json_escape(result), "\""),
    if (is.null(error)) "\"error\":null" else paste0("\"error\":\"", json_escape(error), "\"")
  )
  cat(paste0("{", paste(parts, collapse = ","), "}"), "\n", sep = "")
  flush(stdout())
}

run_cell <- function(code) {
  exprs <- tryCatch(parse(text = code), error = function(e) e)
  if (inherits(exprs, "error")) {
    return(list(ok = FALSE, stdout = "", result = NULL,
                error = paste0("Error: ", conditionMessage(exprs))))
  }
  captured <- character(0)
  buf <- textConnection("captured", open = "w", local = TRUE)
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
  list(ok = is.null(err), stdout = paste(captured, collapse = "\n"),
       result = result, error = err)
}

con <- file("stdin", open = "r")
repeat {
  line <- readLines(con, n = 1)
  if (length(line) == 0) break # host closed stdin -> exit
  id <- trimws(line)
  if (nchar(id) == 0) next
  code <- tryCatch(paste(readLines(codefile, warn = FALSE), collapse = "\n"),
                   error = function(e) "")
  r <- run_cell(code)
  emit(id, r$ok, r$stdout, r$result, r$error)
}
