This file exceeds Choom's configured length limit. Blank lines and full comment
lines do not count.

Check whether the file contains responsibilities with different owners or
reasons to change. Split along those boundaries when the result is easier to
understand. Keep a cohesive schema, fixture, or workflow together when moving
its private helpers would add indirection. Record why a reviewed finding remains.

{% for issue in issues %}
{{ issue.details.file }}
{{ issue.details.message }}
{% endfor %}
