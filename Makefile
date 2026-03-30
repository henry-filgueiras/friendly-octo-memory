.PHONY: evidence-ledger-install evidence-ledger-dev evidence-ledger-build evidence-ledger-preview tradeoff-lens-install tradeoff-lens-dev tradeoff-lens-build tradeoff-lens-preview threadline-install threadline-dev threadline-build threadline-preview local-distillery-serve

evidence-ledger-install:
	cd EvidenceLedger && npm install

evidence-ledger-dev: evidence-ledger-install
	cd EvidenceLedger && npm run dev -- --host 0.0.0.0

evidence-ledger-build: evidence-ledger-install
	cd EvidenceLedger && npm run build

evidence-ledger-preview: evidence-ledger-build
	cd EvidenceLedger && npm run preview -- --host 0.0.0.0

tradeoff-lens-install:
	cd TradeoffLens && npm install

tradeoff-lens-dev: tradeoff-lens-install
	cd TradeoffLens && npm run dev -- --host 0.0.0.0

tradeoff-lens-build: tradeoff-lens-install
	cd TradeoffLens && npm run build

tradeoff-lens-preview: tradeoff-lens-build
	cd TradeoffLens && npm run preview -- --host 0.0.0.0

threadline-install:
	cd Threadline && npm install

threadline-dev: threadline-install
	cd Threadline && npm run dev -- --host 0.0.0.0

threadline-build: threadline-install
	cd Threadline && npm run build

threadline-preview: threadline-build
	cd Threadline && npm run preview -- --host 0.0.0.0

local-distillery-serve:
	cd LocalDistillery && python3 -m http.server 4173
