This function exceeds Choom's configured length limit. The limit depends on
whether the file contains ordinary TypeScript, JSX, tests, or scripts. Blank
lines and full comment lines do not count.

Look for separate responsibilities before extracting code. Keep a cohesive
validation sequence or test scenario together when splitting it would hide
ordering, ownership, or assertions. Do not compress lines or add a wrapper only
to lower the count. Record why a reviewed finding remains.

{% for issue in issues %}
{{ issue.details.file }}:{{ issue.details.line }}
{{ issue.details.message }}
{% endfor %}
