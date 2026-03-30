import { useEffect, useState } from "react";
import type { AnalysisView } from "../components/AnalysisPane";
import { getDemoScenarios } from "../data/demos";
import { analyzeScenario } from "../domain/analysis";
import {
  createClaim,
  createEmptyScenario,
  createLink,
  createSource,
  duplicateClaim,
  syncScenario,
} from "../domain/helpers";
import type { Claim, EvidenceLink, EvidenceScenario, Source } from "../domain/types";
import { loadScenario, saveScenario } from "../utils/storage";

function touchScenario(scenario: EvidenceScenario): EvidenceScenario {
  return syncScenario({
    ...scenario,
    updatedAt: new Date().toISOString(),
  });
}

export function useEvidenceScenarioState() {
  const [scenario, setScenario] = useState<EvidenceScenario>(() => loadScenario());
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [analysisView, setAnalysisView] = useState<AnalysisView>("claims");

  useEffect(() => {
    saveScenario(scenario);
  }, [scenario]);

  useEffect(() => {
    if (scenario.claims.length === 0) {
      setSelectedClaimId(null);
      return;
    }

    if (!selectedClaimId || !scenario.claims.some((claim) => claim.id === selectedClaimId)) {
      setSelectedClaimId(scenario.claims[0].id);
    }
  }, [scenario.claims, selectedClaimId]);

  function commitScenario(
    nextScenario: EvidenceScenario | ((current: EvidenceScenario) => EvidenceScenario)
  ) {
    setScenario((current) =>
      touchScenario(typeof nextScenario === "function" ? nextScenario(current) : nextScenario)
    );
  }

  function updateScenario(patch: Partial<EvidenceScenario>) {
    commitScenario((current) => ({ ...current, ...patch }));
  }

  function updateClaim(claimId: string, patch: Partial<Claim>) {
    commitScenario((current) => ({
      ...current,
      claims: current.claims.map((claim) => (claim.id === claimId ? { ...claim, ...patch } : claim)),
    }));
  }

  function updateSource(sourceId: string, patch: Partial<Source>) {
    commitScenario((current) => ({
      ...current,
      sources: current.sources.map((source) =>
        source.id === sourceId ? { ...source, ...patch } : source
      ),
    }));
  }

  function updateLink(linkId: string, patch: Partial<EvidenceLink>) {
    commitScenario((current) => ({
      ...current,
      links: current.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)),
    }));
  }

  function addClaim() {
    commitScenario((current) => {
      const claim = createClaim();
      return {
        ...current,
        claims: [...current.claims, claim],
      };
    });
  }

  function duplicateClaimById(claimId: string) {
    commitScenario((current) => {
      const claim = current.claims.find((entry) => entry.id === claimId);

      if (!claim) {
        return current;
      }

      return {
        ...current,
        claims: [...current.claims, duplicateClaim(claim)],
      };
    });
  }

  function deleteClaim(claimId: string) {
    commitScenario((current) => ({
      ...current,
      claims: current.claims.filter((claim) => claim.id !== claimId),
      links: current.links.filter((link) => link.claimId !== claimId),
    }));
  }

  function addSource() {
    commitScenario((current) => ({
      ...current,
      sources: [...current.sources, createSource()],
    }));
  }

  function deleteSource(sourceId: string) {
    commitScenario((current) => ({
      ...current,
      sources: current.sources.filter((source) => source.id !== sourceId),
      links: current.links.filter((link) => link.sourceId !== sourceId),
    }));
  }

  function addLink() {
    commitScenario((current) => {
      const claimId = current.claims[0]?.id;
      const sourceId = current.sources[0]?.id;

      if (!claimId || !sourceId) {
        return current;
      }

      return {
        ...current,
        links: [...current.links, createLink(claimId, sourceId)],
      };
    });
  }

  function deleteLink(linkId: string) {
    commitScenario((current) => ({
      ...current,
      links: current.links.filter((link) => link.id !== linkId),
    }));
  }

  function replaceScenario(nextScenario: EvidenceScenario) {
    setScenario(touchScenario(nextScenario));
    setSelectedClaimId(nextScenario.claims[0]?.id ?? null);
  }

  function loadDemoScenario(demoId: string) {
    const demo = getDemoScenarios().find((entry) => entry.id === demoId);

    if (!demo) {
      return;
    }

    replaceScenario(demo.scenario);
    setAnalysisView("claims");
  }

  function resetScenario() {
    replaceScenario(createEmptyScenario());
  }

  return {
    analysis: analyzeScenario(scenario),
    analysisView,
    addClaim,
    addLink,
    addSource,
    deleteClaim,
    deleteLink,
    deleteSource,
    duplicateClaimById,
    loadDemoScenario,
    replaceScenario,
    resetScenario,
    scenario,
    selectedClaimId,
    setAnalysisView,
    setSelectedClaimId,
    updateClaim,
    updateLink,
    updateScenario,
    updateSource,
  };
}
