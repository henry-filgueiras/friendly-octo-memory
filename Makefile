.PHONY: tradeoff-lens-install tradeoff-lens-dev tradeoff-lens-build tradeoff-lens-preview

tradeoff-lens-install:
	cd TradeoffLens && npm install

tradeoff-lens-dev: tradeoff-lens-install
	cd TradeoffLens && npm run dev -- --host 0.0.0.0

tradeoff-lens-build: tradeoff-lens-install
	cd TradeoffLens && npm run build

tradeoff-lens-preview: tradeoff-lens-build
	cd TradeoffLens && npm run preview -- --host 0.0.0.0
