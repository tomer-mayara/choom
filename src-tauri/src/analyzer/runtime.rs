use super::{
    files::Source,
    model::{Code, Problem, Stage},
};
use serde::Deserialize;
use serde_json::Value;
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    pub repository_session: String,
    pub config: String,
    pub inputs: Vec<String>,
    pub node_executable: Option<String>,
}

impl Request {
    pub fn decode(value: Value) -> Result<Self, Problem> {
        if value.get("nodeExecutable").is_some_and(Value::is_null) {
            return Err(Problem::invalid());
        }
        let request: Self = serde_json::from_value(value).map_err(|_| Problem::invalid())?;
        literal_relative(&request.config)?;
        if request.inputs.is_empty() || request.inputs.len() > 128 {
            return Err(Problem::invalid());
        }
        for input in &request.inputs {
            literal_relative(input)?;
        }
        if let Some(node) = &request.node_executable {
            path_text(node)?;
            if !Path::new(node).is_absolute() {
                return Err(Problem::invalid());
            }
        }
        Ok(request)
    }
}

fn path_text(path: &str) -> Result<(), Problem> {
    if path.is_empty() || path.len() > 4096 || path.chars().any(char::is_control) {
        return Err(Problem::invalid());
    }
    Ok(())
}

fn literal_relative(path: &str) -> Result<(), Problem> {
    path_text(path)?;
    if path.starts_with('-')
        || path.contains([
            '\\', ':', '*', '?', '[', ']', '{', '}', '(', ')', '!', '$', '`', ';', '|', '&', '<',
            '>',
        ])
        || Path::new(path).is_absolute()
        || (path != "."
            && path
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == ".."))
    {
        return Err(Problem::invalid());
    }
    Ok(())
}

pub(crate) struct Runtime {
    pub node: PathBuf,
    pub entry: PathBuf,
    pub config: PathBuf,
    pub inputs: Vec<String>,
    sources: Vec<Source>,
}

impl Runtime {
    pub fn resolve(
        request: &Request,
        root: &Path,
        search_path: Option<&OsString>,
    ) -> Result<Self, Problem> {
        let node = resolve_node(request.node_executable.as_deref(), search_path)?;
        let config = Source::resolve(root, root.join(&request.config), false)?;
        config.read_text(262_144)?;
        let config_path = process_path(&config.path)?;
        if config_path.to_string_lossy().contains(['%', '#', '?']) {
            return Err(Problem::new(
                Stage::Setup,
                Code::UnsupportedConfigPath,
                "Move the repository or analyzer configuration to a path without %, #, or ? before running dependency-cruiser.",
            ));
        }
        let package_requested = root.join("node_modules/dependency-cruiser");
        let package = fs::canonicalize(&package_requested).map_err(|_| {
            Problem::new(
                Stage::Setup,
                Code::AnalyzerNotFound,
                "Install dependency-cruiser 18.7.2 in the selected repository before analysis.",
            )
        })?;
        let unsupported = || {
            Problem::new(
                Stage::Setup,
                Code::UnsupportedAnalyzer,
                "Use repository-local dependency-cruiser 18.7.2 with its supported Node engine and entry point.",
            )
        };
        if !package.starts_with(root) || !package.is_dir() {
            return Err(unsupported());
        }
        let metadata = Source::resolve(&package, package_requested.join("package.json"), false)
            .map_err(|_| unsupported())?;
        let contents: Value =
            serde_json::from_str(&metadata.read_text(262_144).map_err(|_| unsupported())?)
                .map_err(|_| unsupported())?;
        if contents["name"] != "dependency-cruiser"
            || contents["version"] != "18.7.2"
            || contents["engines"]["node"] != "^22||^24||>=26"
            || contents["bin"]["dependency-cruiser"] != "bin/dependency-cruiser.mjs"
        {
            return Err(unsupported());
        }
        let entry = Source::resolve(
            &package,
            package_requested.join("bin/dependency-cruiser.mjs"),
            false,
        )
        .map_err(|_| unsupported())?;
        let entry_path = process_path(&entry.path)?;
        let mut sources = vec![config, metadata, entry];
        let mut inputs = Vec::with_capacity(request.inputs.len());
        for input in &request.inputs {
            let source = Source::resolve(root, root.join(input), true)?;
            let relative = source
                .path
                .strip_prefix(root)
                .map_err(|_| Problem::invalid())?;
            let relative = if relative.as_os_str().is_empty() {
                ".".to_owned()
            } else {
                relative
                    .iter()
                    .map(|part| part.to_str().ok_or_else(Problem::invalid))
                    .collect::<Result<Vec<_>, _>>()?
                    .join("/")
            };
            literal_relative(&relative)?;
            inputs.push(relative);
            sources.push(source);
        }
        Ok(Self {
            node,
            entry: entry_path,
            config: config_path,
            inputs,
            sources,
        })
    }

    pub fn verify(&self) -> Result<(), Problem> {
        for source in &self.sources {
            source.verify()?;
        }
        Ok(())
    }
}

fn resolve_node(
    configured: Option<&str>,
    search_path: Option<&OsString>,
) -> Result<PathBuf, Problem> {
    let executable = if cfg!(windows) { "node.exe" } else { "node" };
    let candidates: Vec<PathBuf> = match configured {
        Some(path) => vec![PathBuf::from(path)],
        None => search_path
            .map(|path| {
                std::env::split_paths(path)
                    .filter(|path| path.is_absolute())
                    .map(|path| path.join(executable))
                    .collect()
            })
            .unwrap_or_default(),
    };
    for candidate in candidates {
        if cfg!(windows)
            && candidate
                .extension()
                .is_none_or(|ext| !ext.eq_ignore_ascii_case("exe"))
        {
            continue;
        }
        if let Ok(path) = fs::canonicalize(candidate) {
            if !path.is_file() {
                continue;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if !fs::metadata(&path)
                    .is_ok_and(|metadata| metadata.permissions().mode() & 0o111 != 0)
                {
                    continue;
                }
            }
            return process_path(&path);
        }
    }
    Err(Problem::new(
        Stage::Setup,
        Code::NodeNotFound,
        "Select an absolute Node executable or make Node available on the desktop application PATH.",
    ))
}

pub(crate) fn process_path(path: &Path) -> Result<PathBuf, Problem> {
    let simplified = dunce::simplified(path);
    if simplified.to_str().is_none() || simplified.to_string_lossy().starts_with(r"\\?\") {
        return Err(Problem::invalid());
    }
    Ok(simplified.to_owned())
}

pub(crate) fn supported_node(bytes: &[u8]) -> bool {
    let Ok(version) = std::str::from_utf8(bytes) else {
        return false;
    };
    let Some(version) = version.trim().strip_prefix('v') else {
        return false;
    };
    let (core, build) = version
        .split_once('+')
        .map_or((version, None), |(core, build)| (core, Some(build)));
    if build.is_some_and(|build| {
        build.split('.').any(|part| {
            part.is_empty()
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
    }) {
        return false;
    }
    let parts = core.split('.').collect::<Vec<_>>();
    if parts.len() != 3
        || parts.iter().any(|part| {
            part.is_empty()
                || !part.bytes().all(|byte| byte.is_ascii_digit())
                || part.parse::<u64>().is_err()
                || (part.len() > 1 && part.starts_with('0'))
        })
    {
        return false;
    }
    let major = parts[0].parse::<u64>().unwrap_or(0);
    major == 22 || major == 24 || major >= 26
}
