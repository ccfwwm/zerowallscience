#![cfg_attr(windows, windows_subsystem = "windows")]

use std::ffi::OsString;
use std::io::{self, Write};
use std::process::{Command, Stdio};

fn child_command(args: impl IntoIterator<Item = OsString>) -> Result<(OsString, Vec<OsString>), String> {
    let mut args = args.into_iter();
    let command = args
        .next()
        .ok_or_else(|| "missing MCP child command".to_string())?;
    Ok((command, args.collect()))
}

fn main() {
    let (command, args) = match child_command(std::env::args_os().skip(1)) {
        Ok(command) => command,
        Err(error) => {
            eprintln!("zerowall-mcp-proxy: {error}");
            std::process::exit(64);
        }
    };
    let mut child_command = Command::new(command);
    child_command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        child_command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = match child_command.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!("zerowall-mcp-proxy: failed to start MCP child: {error}");
            std::process::exit(1);
        }
    };

    let mut child_stdin = child.stdin.take().expect("piped stdin");
    let mut child_stdout = child.stdout.take().expect("piped stdout");
    let mut child_stderr = child.stderr.take().expect("piped stderr");
    let stdin = std::thread::spawn(move || io::copy(&mut io::stdin().lock(), &mut child_stdin));
    let stdout = std::thread::spawn(move || {
        let result = io::copy(&mut child_stdout, &mut io::stdout().lock());
        let _ = io::stdout().flush();
        result
    });
    let stderr = std::thread::spawn(move || {
        let result = io::copy(&mut child_stderr, &mut io::stderr().lock());
        let _ = io::stderr().flush();
        result
    });

    let status = child.wait();
    let _ = stdin.join();
    let _ = stdout.join();
    let _ = stderr.join();
    match status {
        Ok(status) => std::process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("zerowall-mcp-proxy: failed waiting for MCP child: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::child_command;
    use std::ffi::OsString;

    #[test]
    fn preserves_the_child_program_and_arguments() {
        let (program, args) = child_command(["python.exe", "-m", "server"].map(OsString::from)).unwrap();
        assert_eq!(program, OsString::from("python.exe"));
        assert_eq!(args, [OsString::from("-m"), OsString::from("server")]);
    }

    #[test]
    fn rejects_a_missing_child_program() {
        assert!(child_command(Vec::<OsString>::new()).is_err());
    }
}
