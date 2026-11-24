def page_count(total, per_page):
    return total // per_page


def page_slice(items, page, per_page):
    if not items:
        return [], False
    start = (page - 1) * per_page
    chunk = items[start:start + per_page]
    has_more = len(chunk) is per_page and start + per_page < len(items)
    return chunk, has_more
