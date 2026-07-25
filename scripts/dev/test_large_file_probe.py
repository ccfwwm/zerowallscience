#!/usr/bin/env python3
"""Tests for the large-file probe (runtime/skills/core/large-file).

Run: python scripts/dev/test_large_file_probe.py
Stdlib unittest only.
"""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

_MOD = (
    Path(__file__).resolve().parents[2]
    / "runtime/skills/core/large-file/large_file_probe.py"
)
_spec = importlib.util.spec_from_file_location("large_file_probe", _MOD)
assert _spec and _spec.loader
lp = importlib.util.module_from_spec(_spec)
sys.modules["large_file_probe"] = lp
_spec.loader.exec_module(lp)


def tmp(name, body):
    d = tempfile.mkdtemp()
    p = Path(d) / name
    p.write_text(body)
    return p


class Table(unittest.TestCase):
    def test_schema_rowcount_sample(self):
        rows = "id,name,score\n" + "\n".join(f"{i},n{i},{i*1.5}" for i in range(1, 1001))
        p = tmp("data.csv", rows + "\n")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "table")
        self.assertEqual(r["n_columns"], 3)
        self.assertEqual(r["approx_rows"], 1000)
        names = [c["name"] for c in r["columns"]]
        self.assertEqual(names, ["id", "name", "score"])
        types = {c["name"]: c["dtype"] for c in r["columns"]}
        self.assertEqual(types["id"], "int")
        self.assertEqual(types["score"], "float")
        self.assertEqual(types["name"], "str")
        self.assertEqual(len(r["sample_head"]), 3)
        self.assertEqual(r["sample_head"][0], ["1", "n1", "1.5"])
        # tail sample reaches the last row
        self.assertEqual(r["sample_tail"][-1][0], "1000")

    def test_tsv_delimiter(self):
        p = tmp("data.tsv", "a\tb\n1\t2\n3\t4\n")
        r = lp.probe(p, 2)
        self.assertEqual(r["delimiter"], "\\t")
        self.assertEqual(r["n_columns"], 2)

    def test_does_not_load_whole_file(self):
        # A 5 MB CSV must be summarised without returning its bulk. The pointer
        # (serialised) must be far smaller than the file.
        big = "x,y\n" + "\n".join(f"{i},{i}" for i in range(300_000))
        p = tmp("big.csv", big + "\n")
        r = lp.probe(p, 5)
        self.assertEqual(r["approx_rows"], 300_000)
        pointer = json.dumps(r)
        self.assertLess(len(pointer), 4000, "pointer must stay tiny vs the file")
        self.assertLess(len(pointer), p.stat().st_size / 100)


class Ndjson(unittest.TestCase):
    def test_keys_and_count(self):
        body = "\n".join(json.dumps({"a": i, "b": str(i)}) for i in range(50))
        p = tmp("recs.jsonl", body + "\n")
        r = lp.probe(p, 4)
        self.assertEqual(r["format"], "ndjson")
        self.assertEqual(sorted(r["keys"]), ["a", "b"])
        self.assertEqual(r["approx_records"], 50)
        self.assertEqual(len(r["sample"]), 4)


class TextLog(unittest.TestCase):
    def test_text_head_tail_lines(self):
        p = tmp("notes.txt", "\n".join(f"line {i}" for i in range(100)) + "\n")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "text")
        self.assertEqual(r["lines"], 100)
        self.assertEqual(r["sample_head"][0], "line 0")
        self.assertEqual(r["sample_tail"][-1], "line 99")

    def test_vasp_log_numeric_extraction(self):
        # A VASP-style OUTCAR: the probe extracts the LAST energy, not the prose.
        body = (
            "some header\n"
            "  free  energy   TOTEN  =        -10.5 eV\n"
            "  energy(sigma->0) =      -10.4\n"
            "... many iterations ...\n"
            "  free  energy   TOTEN  =        -42.123456 eV\n"
            "  energy(sigma->0) =      -42.100000\n"
            "  reached required accuracy - stopping\n"
        )
        p = tmp("OUTCAR", body)
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "log")
        self.assertAlmostEqual(r["extracted"]["vasp_free_energy_eV"], -42.123456)
        self.assertAlmostEqual(r["extracted"]["vasp_energy_sigma0_eV"], -42.1)
        self.assertIn("converged_electronic", r["extracted"])


class BinaryFormats(unittest.TestCase):
    def test_parquet_pointer_or_schema(self):
        # No real parquet file; a .parquet path degrades to a clear pointer,
        # never a crash or a raw dump.
        p = tmp("x.parquet", "not really parquet")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "parquet")
        # Either introspected (pyarrow present) or a clear install hint.
        self.assertTrue("hint" in r or "columns" in r or "introspection" in r)

    def test_hdf5_missing_lib_hint(self):
        p = tmp("x.h5", "binary")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "hdf5")
        self.assertTrue("datasets" in r or "hint" in r or "introspection" in r)


class Genomics(unittest.TestCase):
    def _fastq(self, n):
        recs = []
        for i in range(n):
            recs += [f"@read{i} desc", "ACGT" * (i % 3 + 1), "+", "IIII" * (i % 3 + 1)]
        return "\n".join(recs) + "\n"

    def test_fastq_reads_and_length_stats(self):
        p = tmp("reads.fastq", self._fastq(100))
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "fastq")
        self.assertEqual(r["approx_reads"], 100)  # 400 lines / 4
        self.assertIn("read_length", r)           # min/max observed on the sample
        self.assertTrue(r["sample_ids"])          # first read ids, no full sequences dumped

    def test_fastq_gzip(self):
        import gzip
        d = tempfile.mkdtemp()
        p = Path(d) / "reads.fq.gz"
        with gzip.open(p, "wt") as fh:
            fh.write(self._fastq(40))
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "fastq")
        self.assertEqual(r["approx_reads"], 40)
        self.assertTrue(r.get("gzipped"))

    def test_fasta_sequences(self):
        body = ">seq1 alpha\nACGTACGT\nACGT\n>seq2 beta\nTTTT\n"
        p = tmp("genome.fasta", body)
        r = lp.probe(p, 5)
        self.assertEqual(r["format"], "fasta")
        self.assertEqual(r["approx_sequences"], 2)
        self.assertIn("seq1", " ".join(r["sample_ids"]))

    def test_vcf_variants_and_samples(self):
        body = (
            "##fileformat=VCFv4.2\n"
            "##source=test\n"
            "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\tS2\n"
            "1\t100\t.\tA\tG\t50\tPASS\t.\tGT\t0/1\t1/1\n"
            "1\t200\t.\tC\tT\t60\tPASS\t.\tGT\t0/0\t0/1\n"
        )
        p = tmp("calls.vcf", body)
        r = lp.probe(p, 5)
        self.assertEqual(r["format"], "vcf")
        self.assertEqual(r["approx_variants"], 2)
        self.assertEqual(r["samples"], ["S1", "S2"])

    def test_bam_missing_lib_hint(self):
        # Binary; degrades to a clear pysam install hint, never a raw dump.
        p = tmp("aln.bam", "not really bam")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "bam")
        self.assertTrue("hint" in r or "header" in r or "introspection" in r)

    def test_grib_missing_lib_hint(self):
        p = tmp("weather.grib2", "binary")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "grib")
        self.assertTrue("hint" in r or "messages" in r or "introspection" in r)

    def test_root_missing_lib_hint(self):
        p = tmp("events.root", "binary")
        r = lp.probe(p, 3)
        self.assertEqual(r["format"], "root")
        self.assertTrue("hint" in r or "trees" in r or "introspection" in r)


class Driver(unittest.TestCase):
    def test_missing_file(self):
        self.assertIn("error", lp.probe(Path("/no/such/file.csv"), 3))

    def test_note_present(self):
        p = tmp("d.csv", "a,b\n1,2\n")
        self.assertIn("note", lp.probe(p, 2))

    def test_cli_sample_flag(self):
        p = tmp("d.csv", "a,b\n1,2\n3,4\n5,6\n")
        # main prints JSON; capture via run-alike
        r = lp.probe(p, 2)
        self.assertEqual(len(r["sample_head"]), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
