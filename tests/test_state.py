from src.state import State

def test_create_load_save(tmp_path):
    p = tmp_path / "state.json"
    s = State.load(str(p))
    assert s.processed_msg_ids == set()
    assert s.last_processed_msg_id is None

    s.mark_processed(100, status="complete")
    s.mark_processed(102, status="failed")
    s.save(str(p))

    s2 = State.load(str(p))
    assert s2.processed_msg_ids == {100, 102}
    assert s2.last_processed_msg_id == 102
    assert s2.statuses == {100: "complete", 102: "failed"}

def test_is_processed(tmp_path):
    p = tmp_path / "state.json"
    s = State.load(str(p))
    s.mark_processed(50, status="complete")
    assert s.is_processed(50) is True
    assert s.is_processed(51) is False
