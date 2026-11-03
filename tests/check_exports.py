"""Independent check (a different method from the app's own code):
open the Excel export with openpyxl, the CSV with Python's csv module and the backup as JSON.
Run after `npm test`: python tests/check_exports.py"""
import csv, io, json, pathlib

out = pathlib.Path(__file__).parent / "output"
checks = 0

ex = json.loads((out / "exports.json").read_text())
from openpyxl import load_workbook
wb = load_workbook(ex["xlsx"])
assert wb.sheetnames == ["Library", "Versions", "Saved inputs", "Lessons", "Feedback"], wb.sheetnames
les = list(wb["Lessons"].iter_rows(values_only=True))
assert les[1][0] == "Test lesson" and les[1][1] == "Adds a step" and les[1][5] == "Step text", les[1]
checks += 1
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
