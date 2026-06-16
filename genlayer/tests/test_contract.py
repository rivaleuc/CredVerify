import contract_mod as C


def test_derived_qualified_matches_min_score():
    assert C.normalize_cred_verdict({"score": 70, "reasoning": "x"}, 60)["qualified"] is True
    assert C.normalize_cred_verdict({"score": 60, "reasoning": "x"}, 60)["qualified"] is True
    assert C.normalize_cred_verdict({"score": 59, "reasoning": "x"}, 60)["qualified"] is False


def test_normalize_clamps_out_of_range():
    assert C.normalize_cred_verdict({"score": 150}, 50)["score"] == 100
    assert C.normalize_cred_verdict({"score": -5}, 50)["score"] == 0


def test_validator_accepts_consistent():
    v = {"score": 80, "qualified": True, "strengths": "a", "gaps": "b", "reasoning": "ok"}
    assert C.validate_cred_verdict(v, 70) is True
    v2 = {"score": 40, "qualified": False, "strengths": "a", "gaps": "b", "reasoning": "ok"}
    assert C.validate_cred_verdict(v2, 70) is True


def test_validator_rejects_out_of_range_scores():
    assert C.validate_cred_verdict({"score": 101, "qualified": True, "reasoning": "x"}, 50) is False
    assert C.validate_cred_verdict({"score": -1, "qualified": False, "reasoning": "x"}, 50) is False


def test_validator_rejects_inconsistent_qualified():
    # score >= min_score but qualified False
    assert C.validate_cred_verdict({"score": 90, "qualified": False, "reasoning": "x"}, 50) is False
    # score < min_score but qualified True
    assert C.validate_cred_verdict({"score": 10, "qualified": True, "reasoning": "x"}, 50) is False


def test_validator_rejects_bad_types_and_empty_reasoning():
    assert C.validate_cred_verdict({"score": "80", "qualified": True, "reasoning": "x"}, 50) is False
    assert C.validate_cred_verdict({"score": 80, "qualified": "yes", "reasoning": "x"}, 50) is False
    assert C.validate_cred_verdict({"score": True, "qualified": True, "reasoning": "x"}, 50) is False
    assert C.validate_cred_verdict({"score": 80, "qualified": True, "reasoning": ""}, 50) is False


def test_normalized_output_always_passes_validator():
    for min_score in (0, 25, 50, 75, 100):
        for s in range(-20, 130, 5):
            v = C.normalize_cred_verdict({"score": s}, min_score)
            assert C.validate_cred_verdict(v, min_score) is True
