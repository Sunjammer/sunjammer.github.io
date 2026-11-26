BUNDLE ?= $(shell command -v bundle 2>/dev/null || echo "$(HOME)/.local/share/gem/ruby/3.2.0/bin/bundle")

.PHONY: help install serve build

help:
	@echo "make install  Install Ruby dependencies locally"
	@echo "make serve    Start the local site with live reload"
	@echo "make build    Build the production site into _site/"

install:
	$(BUNDLE) install

serve:
	$(BUNDLE) exec jekyll serve --livereload

build:
	$(BUNDLE) exec jekyll build
