# Prosmet Engine

Authoritative deterministic Rust calculation engine. It mirrors the web preview calculation order, uses decimal arithmetic and half-up monetary rounding, emits a SHA-256 digest, and rejects negative or duplicate calculation identifiers.

```bash
cargo test -p prosmet-engine
cargo build --release -p prosmet-engine
echo '{"sections":[]}' | target/release/prosmet-engine-cli
```
