# La référence du banc : la façade, la chaussée et les palmiers actuels du film.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402

bench.setup(frontage=True)
bench.render("baseline")
