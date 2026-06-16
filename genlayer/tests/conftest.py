"""Test harness: inject a fake `genlayer` module so the real contract
(`from genlayer import *`) can be imported by plain pytest, then load the
contract file via importlib and expose it as `contract_mod`."""
import importlib.util
import os
import sys
import types


def _make_fake_genlayer():
    mod = types.ModuleType("genlayer")

    def _passthrough(fn=None, *args, **kwargs):
        # Supports both bare `@gl.public.write` and `@gl.public.write(...)`.
        if callable(fn) and not args and not kwargs:
            return fn

        def deco(f):
            return f

        return deco

    class _Public:
        write = staticmethod(_passthrough)
        view = staticmethod(_passthrough)

    class _Return:
        def __init__(self, calldata):
            self.calldata = calldata

    class _VM:
        Return = _Return

        @staticmethod
        def run_nondet_unsafe(leader_fn, validator_fn):
            return leader_fn()

    class _Message:
        sender_address = "0x000000000000000000000000000000000000dEaD"

    class _Web:
        @staticmethod
        def get(*a, **k):
            raise Exception("web disabled in tests")

        @staticmethod
        def render(*a, **k):
            raise Exception("web disabled in tests")

    class _Nondet:
        web = _Web()

        @staticmethod
        def exec_prompt(*a, **k):
            return {}

    class _Contract:
        pass

    class _GL:
        public = _Public()
        vm = _VM()
        message = _Message()
        nondet = _Nondet()
        Contract = _Contract

    class u256(int):
        pass

    class TreeMap:
        def __class_getitem__(cls, item):
            return cls

    mod.gl = _GL()
    mod.u256 = u256
    mod.TreeMap = TreeMap
    mod.__all__ = ["gl", "u256", "TreeMap"]
    return mod


sys.modules.setdefault("genlayer", _make_fake_genlayer())

_CONTRACT_FILENAME = "cred_verify.py"
_CONTRACT_PATH = os.path.join(os.path.dirname(__file__), "..", _CONTRACT_FILENAME)

_spec = importlib.util.spec_from_file_location("contract_mod", _CONTRACT_PATH)
contract_mod = importlib.util.module_from_spec(_spec)
sys.modules["contract_mod"] = contract_mod
_spec.loader.exec_module(contract_mod)
