from notesync.store import load_notes, save_note


def test_round_trip(tmp_path):
    save_note(tmp_path, {"title": "Hello World", "body": "x"})
    assert load_notes(tmp_path)[0]["title"] == "Hello World"
