fn main() {
    println!("cargo:rerun-if-env-changed=WEB3FORMS_ACCESS_KEY");
    tauri_build::build()
}
