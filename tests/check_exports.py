"""Independent check (a different method from the app's own code):
1. Load the exported Prompt Manager zip with the real prompt_manager.py loader and
   compare every prompt, thinking and tag set with the original repository.
2. Open the Excel export with openpyxl and the CSV with Python's csv module."""
import csv, io, json, sys, types, zipfile, tempfile, pathlib, importlib.util

out = pathlib.Path(__file__).parent / "output"
pm_src, original_zip = sys.argv[1], sys.argv[2]
checks = 0

# stub tkinter so prompt_manager.py imports headlessly; only its file logic is used
for name in ("tkinter", "tkinter.ttk", "tkinter.messagebox"):
    m = types.ModuleType(name); sys.modules[name] = m
sys.modules["tkinter"].ttk = sys.modules["tkinter.ttk"]; sys.modules["tkinter"].messagebox = sys.modules["tkinter.messagebox"]
spec = importlib.util.spec_from_file_location("prompt_manager", pm_src)
pm = importlib.util.module_from_spec(spec); spec.loader.exec_module(pm)
G = pm.AdvancedPromptManagerGUI

export = pathlib.Path((out / "pm-export-path.txt").read_text())
with tempfile.TemporaryDirectory() as tmp:
    zipfile.ZipFile(export).extractall(tmp)
    repo = pathlib.Path(tmp) / "prompt_repository"
    fake = types.SimpleNamespace(repo_path=str(repo), _find_file=G._find_file, _read_text=G._read_text)
    loaded = {n.name: G._load_record(fake, n.name) for n in repo.iterdir() if n.is_dir()}
    with zipfile.ZipFile(original_zip) as z:
        for title, rec in sorted(loaded.items()):
            base = f"Prompting/prompt_repository/{title}/"
            assert rec is not None, title
            assert rec.body == z.read(base + "prompt.txt").decode("utf-8"), f"prompt differs: {title}"
            assert rec.thinking == z.read(base + "thinking.txt").decode("utf-8"), f"thinking differs: {title}"
            assert rec.tags == json.loads(z.read(base + "metadata.json"))["tags"], f"tags differ: {title}"
            checks += 3
    print(f"Prompt Manager loader read {len(loaded)} prompts; prompt, thinking and tags identical to the original ({checks} checks)")

ex = json.loads((out / "exports.json").read_text())
from openpyxl import load_workbook
wb = load_workbook(ex["xlsx"])
assert wb.sheetnames == ["Library", "Versions", "Saved inputs"], wb.sheetnames
lib = list(wb["Library"].iter_rows(values_only=True))
assert lib[0][:3] == ("Title", "Kind", "Tags") and len(lib) - 1 == ex["builds"], len(lib)
ver = list(wb["Versions"].iter_rows(values_only=True))
assert len(ver) - 1 == ex["versions"]
assert all(isinstance(r[1], int) for r in ver[1:]) and all(r[6] for r in ver[1:])
checks += 4
raw = pathlib.Path(ex["csv"]).read_bytes()
assert raw.startswith(b"\xef\xbb\xbf")
rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
assert len(rows) - 1 == ex["builds"] and rows[0][0] == "Title"
assert rows[1][7] == lib[1][7], "CSV and Excel carry the same prompt text"
checks += 3
backup = json.loads(pathlib.Path(ex["backup"]).read_text())
assert backup["app"] == "prompt-builder" and backup["v"] == 1
checks += 1
print(f"Excel: {len(lib)-1} library rows, {len(ver)-1} versions; CSV has BOM and matches Excel; backup header ok")
print(f"ALL {checks} independent checks passed")
