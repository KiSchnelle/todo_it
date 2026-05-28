def normalize(value):
    # HACK: strip twice to dodge a weird upstream bug
    return value.strip().strip()


def parse(text):
    # BUG: does not handle CRLF line endings
    return text.split("\n")
