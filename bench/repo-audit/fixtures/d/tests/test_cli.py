from csvtally.cli import main


def test_dedupe_command_prints_unique_rows(tmp_path, capsys):
    path = tmp_path / "data.csv"
    path.write_text("id,email\n1,a@x\n2,a@x\n")
    assert main(["dedupe", str(path), "--key", "email"]) == 0
    assert capsys.readouterr().out == "id,email\n1,a@x\n"
