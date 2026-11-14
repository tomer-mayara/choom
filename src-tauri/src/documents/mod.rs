mod files;
mod model;
pub use model::{Code, Outcome, Stage, Text};

use files::{Directory, OwnedFile};
use model::{ReadRequest, decode};
use serde_json::Value;
use std::time::Instant;

pub fn read_file(request: Value) -> Outcome<Text> {
    let start = Instant::now();
    let result = decode::<ReadRequest>(request).and_then(|request| {
        let path = files::selected_path(&request.path)?;
        let directory = Directory::open(path.parent().ok_or(Code::InvalidRequest)?)?;
        let mut file = OwnedFile::existing(directory, path)?;
        file.read()
    });
    Outcome::result(result, Stage::Storage, start)
}

#[cfg(test)]
mod read_tests;
