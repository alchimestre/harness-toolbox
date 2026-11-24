from salesreport.aggregate import summarize
from salesreport.ingest import parse_rows


def summary_for(lines, zone):
    return summarize(parse_rows(lines), zone)


def render_rows(days):
    return [f"{day},{amount}" for day, amount in days]
