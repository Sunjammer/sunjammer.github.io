---
layout: page
title: Work
permalink: /work/
---

Some things I've made have been public products; others have lived inside studios, institutions, and organisations. What remains interesting is usually less the list of technologies than the peculiar problem, the constraints, and what the work taught me.

<div class="project-grid">
{% assign projects = site.projects | sort: "order" %}
{% for project in projects %}
<a class="project-card" href="{{ project.url | relative_url }}"><div class="project-card__image">{% if project.thumbnail %}<img src="{{ project.thumbnail | relative_url }}" alt="{{ project.thumbnail_alt | default: '' | escape }}" loading="lazy" />{% else %}<span aria-hidden="true">{{ project.title | slice: 0 }}</span>{% endif %}</div><div class="project-card__body"><h3>{{ project.title }}</h3><p>{{ project.description }}</p><span class="project-card__link">Read the history</span></div></a>
{% endfor %}
</div>
