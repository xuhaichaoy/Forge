use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::OPENAI_BUNDLED_MARKETPLACE_NAME;

pub(crate) fn unique_test_dir(prefix: &str) -> PathBuf {
    env::temp_dir().join(format!(
        "{prefix}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default()
    ))
}

pub(crate) fn create_fake_openai_bundled_marketplace(cli_home: &Path) -> PathBuf {
    let marketplace = cli_home
        .join(".tmp")
        .join("bundled-marketplaces")
        .join(OPENAI_BUNDLED_MARKETPLACE_NAME);
    let manifest_dir = marketplace.join(".agents").join("plugins");
    fs::create_dir_all(&manifest_dir).unwrap();
    fs::write(manifest_dir.join("marketplace.json"), r#"{"plugins":[]}"#).unwrap();
    marketplace
}
