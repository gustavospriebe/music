from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
FEATURE = ROOT / ".specs/features/p2-readiness"

required = ["spec.md", "context.md", "design.md", "tasks.md", "verification.md"]
for name in required:
    assert (FEATURE / name).is_file(), f"missing {name}"

spec = (FEATURE / "spec.md").read_text()
tasks = (FEATURE / "tasks.md").read_text()
verification = (FEATURE / "verification.md").read_text()
ids = set(re.findall(r"\*\*([A-Z]+-\d{2})\*\*", spec))
assert ids == {
    "COVER-01", "COVER-02", "COVER-03", "COVER-04", "COVER-05",
    "COVER-06", "COVER-07", "COVER-08", "COVER-09", "COVER-10",
    "PERF-01", "PERF-02", "MAINT-01", "MAINT-02",
    "OPS-01", "OPS-02", "OPS-03", "TEST-01", "TEST-02",
}, f"unexpected requirement set: {sorted(ids)}"
for requirement in ids:
    assert requirement in tasks, f"unmapped requirement {requirement}"
assert len(re.findall(r"^### T\d+:", tasks, flags=re.MULTILINE)) == 8
assert "### T8: Run complete and independent validation\n\n**Status**: Complete" in tasks
assert "- [ ]" not in spec, "feature goals or success criteria remain unchecked"
assert "**Local verdict:** PASS" in verification
assert "**External verdict:** EXTERNAL BLOCKED" in verification
assert "PASS: 19/19 requirements" in verification
activation = (ROOT / "docs/external-activation-runbook.md").read_text()
for marker in ["EXTERNAL BLOCKED", "Comando", "Evidência esperada", "Rollback", "Aceite", "Restore drill"]:
    assert marker in activation, f"missing activation marker: {marker}"
env_example = (ROOT / ".env.example").read_text()
for setting in ["OPENROUTER_COVER_TEXT_MODEL", "OPENROUTER_COVER_REFERENCE_MODEL", "STORAGE_PROVIDER", "STORAGE_S3_BUCKET"]:
    assert setting in env_example, f"missing env setting: {setting}"
restore = ROOT / "scripts/restore-drill.sh"
assert restore.is_file() and "RESTORE_DRILL_CONFIRM" in restore.read_text()
print(f"PASS: {len(ids)} requirements mapped across 8 tasks")
