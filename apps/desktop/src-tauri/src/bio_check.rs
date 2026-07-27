// BioPlausibilityVerifier — the deterministic core of RV-Loop's "re-check
// against live sources" leg. Claude Science's Reviewer explicitly does *not*
// re-run or re-check the analysis against external data; this module does, for
// the biological entities and relations a report asserts.
//
// The verdict is not the model's. kimi-k3 upstream only *extracts* the claimed
// entities/relations from free text into `BioClaim`s and *explains* the result;
// here each claim is resolved against a fixed, license-clear public registry —
// UniProt (protein/gene existence), QuickGO (Gene Ontology terms), Reactome
// (gene→pathway membership) — and the verdict follows deterministically from
// what those sources return. The lookup is an app-control-plane HTTP GET to a
// fixed known host, the same class as `model_probe`/`updates`, not the agent
// reaching into the workspace, so it does not fall under the agent-approval
// gate.
//
// Two safety rules shape the calibration:
//   * We never turn a coverage gap or a transport failure into a false `error`.
//     A named entity that a source does not return is `error` only when the
//     source is authoritative for existence (UniProt/QuickGO); an unproven
//     *relation* (Reactome membership) degrades to `warn`, because Reactome's
//     pathway coverage is incomplete and absence is not disproof.
//   * License-gated sources (KEGG, DisGeNET, DepMap, …) are never queried
//     silently. Without a user-supplied key the claim is `warn` with the gap
//     named, never skipped and never guessed.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// One biological claim extracted from a report, to be re-checked against a
/// live source. Every field is optional/defaulted so a claim that carries only
/// what the report stated still gets the checks that apply to it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BioClaim {
    /// What kind of claim this is: `protein` / `gene` (existence in UniProt),
    /// `go_term` (a Gene Ontology term), `gene_pathway` (a gene's membership in
    /// a pathway, via Reactome). Anything else is reported as unsupported.
    #[serde(default)]
    pub kind: String,
    /// Gene/protein symbol or name, e.g. "TP53". Used by protein/gene/gene_pathway.
    #[serde(default)]
    pub symbol: String,
    /// NCBI taxon id; defaults to human (9606) when absent.
    #[serde(default)]
    pub organism_id: Option<u32>,
    /// A Gene Ontology id, e.g. "GO:0006915". Used by `go_term`.
    #[serde(default)]
    pub go_id: String,
    /// A human-readable term/label the report used (GO term text, or a
    /// descriptive name). Carried into evidence; not itself authoritative.
    #[serde(default)]
    pub term: String,
    /// The pathway the report claims the gene belongs to (name or Reactome
    /// stable id). Used by `gene_pathway`.
    #[serde(default)]
    pub pathway: String,
    /// An explicit source the report leaned on, if any. Used to detect claims
    /// that would require a license-gated database (KEGG/DisGeNET/…).
    #[serde(default)]
    pub source: String,
    /// The report sentence this claim came from, echoed into evidence so the
    /// verdict is traceable to the text.
    #[serde(default)]
    pub statement: String,
}

/// One plausibility verdict. Shares the verification vocabulary
/// (`ok` | `warn` | `error`) and the `{level, rule, title, evidence}` shape with
/// `MethodFinding`, so the front-end bridge maps it to a reviewer finding with
/// `check = "bio_plausibility"` exactly as it does for method checks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BioFinding {
    pub level: String,
    pub rule: String,
    pub title: String,
    pub evidence: String,
}

impl BioFinding {
    fn new(level: &str, rule: &str, title: &str, evidence: String) -> Self {
        Self {
            level: level.to_owned(),
            rule: rule.to_owned(),
            title: title.to_owned(),
            evidence,
        }
    }
}

/// Databases whose licence forbids silent redistribution/querying here. A claim
/// that would need one is reported (`warn`) rather than queried or guessed.
fn is_license_gated(source: &str) -> bool {
    let s = source.to_lowercase();
    ["kegg", "disgenet", "depmap", "cadd", "panglaodb"]
        .iter()
        .any(|g| s.contains(g))
}

fn organism_or_human(id: Option<u32>) -> u32 {
    id.unwrap_or(9606)
}

/// A well-formed GO id is `GO:` followed by exactly seven digits.
fn go_id_wellformed(id: &str) -> bool {
    let t = id.trim();
    match t.strip_prefix("GO:").or_else(|| t.strip_prefix("go:")) {
        Some(rest) => rest.len() == 7 && rest.chars().all(|c| c.is_ascii_digit()),
        None => false,
    }
}

// ---- UniProt (protein/gene existence) -------------------------------------

/// A resolved UniProt entry — enough to cite and to check organism agreement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UniProtHit {
    pub accession: String,
    pub gene: String,
    pub organism: String,
    pub taxon_id: u64,
}

/// Search reviewed (Swiss-Prot) entries first so a symbol resolves to its
/// canonical accession (e.g. TP53 → P04637) rather than a TrEMBL fragment.
fn uniprot_search_url(symbol: &str, organism_id: u32, reviewed: bool) -> String {
    let sym = symbol.trim();
    let rev = if reviewed { " AND reviewed:true" } else { "" };
    let query = format!("gene:{sym} AND organism_id:{organism_id}{rev}");
    format!(
        "https://rest.uniprot.org/uniprotkb/search?query={}&format=json&fields=accession,id,organism_name,gene_primary&size=1",
        urlencode(&query)
    )
}

/// Parse the first hit from a UniProt search body. Empty `results` → None
/// (the symbol did not resolve for that organism). Defensive: any missing
/// field degrades to an empty string rather than failing the whole parse.
pub fn parse_uniprot(body: &Value) -> Option<UniProtHit> {
    let first = body.get("results")?.as_array()?.first()?;
    let accession = first
        .get("primaryAccession")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    if accession.is_empty() {
        return None;
    }
    let gene = first
        .get("genes")
        .and_then(Value::as_array)
        .and_then(|g| g.first())
        .and_then(|g| g.get("geneName"))
        .and_then(|n| n.get("value"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let organism = first
        .get("organism")
        .and_then(|o| o.get("scientificName"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let taxon_id = first
        .get("organism")
        .and_then(|o| o.get("taxonId"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Some(UniProtHit {
        accession,
        gene,
        organism,
        taxon_id,
    })
}

// ---- QuickGO (Gene Ontology terms) ----------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoHit {
    pub id: String,
    pub name: String,
    pub obsolete: bool,
}

fn quickgo_url(go_id: &str) -> String {
    format!(
        "https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/{}",
        urlencode(go_id.trim())
    )
}

/// Parse a QuickGO term lookup. `numberOfHits == 0` or an empty `results` → None.
pub fn parse_quickgo(body: &Value) -> Option<GoHit> {
    let first = body.get("results")?.as_array()?.first()?;
    let id = first.get("id").and_then(Value::as_str).unwrap_or("").to_owned();
    if id.is_empty() {
        return None;
    }
    let name = first.get("name").and_then(Value::as_str).unwrap_or("").to_owned();
    let obsolete = first.get("isObsolete").and_then(Value::as_bool).unwrap_or(false);
    Some(GoHit { id, name, obsolete })
}

// ---- Reactome (gene→pathway membership) -----------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathwayHit {
    pub st_id: String,
    pub name: String,
}

fn reactome_mapping_url(accession: &str, organism_id: u32) -> String {
    format!(
        "https://reactome.org/ContentService/data/mapping/UniProt/{}/pathways?species={organism_id}",
        urlencode(accession.trim())
    )
}

/// Parse the Reactome mapping array into (stId, displayName) pairs. A non-array
/// body (Reactome returns a 404 text for an unmapped accession) → empty vec.
pub fn parse_reactome(body: &Value) -> Vec<PathwayHit> {
    let Some(arr) = body.as_array() else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|p| {
            let st_id = p.get("stId").and_then(Value::as_str).unwrap_or("").to_owned();
            if st_id.is_empty() {
                return None;
            }
            let name = p
                .get("displayName")
                .and_then(Value::as_str)
                .or_else(|| p.get("name").and_then(Value::as_array).and_then(|n| n.first()).and_then(Value::as_str))
                .unwrap_or("")
                .to_owned();
            Some(PathwayHit { st_id, name })
        })
        .collect()
}

/// Does the claimed pathway match any of the gene's Reactome pathways? Matches
/// on stable id (exact, case-insensitive) or on name (either contains the
/// other, case-insensitive) so "apoptosis" matches "Apoptosis" and a report's
/// slightly longer phrasing still resolves.
pub fn pathway_matches<'a>(hits: &'a [PathwayHit], claimed: &str) -> Option<&'a PathwayHit> {
    let want = claimed.trim().to_lowercase();
    if want.is_empty() {
        return None;
    }
    hits.iter().find(|h| {
        let id = h.st_id.to_lowercase();
        let name = h.name.to_lowercase();
        id == want || (!name.is_empty() && (name.contains(&want) || want.contains(&name)))
    })
}

/// Minimal percent-encoding for query text (space, `:`, `+`, `&`, `/`). The
/// registry queries only ever carry symbols, accessions, and GO ids, so this
/// covers every character they can contain without pulling in a URL crate.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn client() -> Option<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science bio-plausibility check")
        .timeout(Duration::from_secs(8))
        .build()
        .ok()
}

/// The one network boundary. Every parser above is pure and unit-tested; this
/// GET is not, so a failure here (offline, 404, non-JSON) returns None and the
/// caller degrades to `warn` — never a false `error`.
fn fetch_json(client: &reqwest::blocking::Client, url: &str) -> Option<Value> {
    let body = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .and_then(|r| r.error_for_status())
        .ok()?
        .text()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn unreachable_warn(rule: &str, source: &str, claim: &BioClaim) -> BioFinding {
    BioFinding::new(
        "warn",
        rule,
        &format!("Could not reach {source}"),
        format!(
            "'{}' could not be verified because {source} was unreachable; the claim is neither \
             confirmed nor refuted.",
            claim_label(claim)
        ),
    )
}

/// A short label for the entity a claim is about, for titles and evidence.
fn claim_label(c: &BioClaim) -> String {
    if !c.symbol.trim().is_empty() {
        c.symbol.trim().to_owned()
    } else if !c.go_id.trim().is_empty() {
        c.go_id.trim().to_owned()
    } else if !c.term.trim().is_empty() {
        c.term.trim().to_owned()
    } else {
        "(unnamed claim)".to_owned()
    }
}

fn check_protein(client: &reqwest::blocking::Client, c: &BioClaim) -> BioFinding {
    let sym = c.symbol.trim();
    if sym.is_empty() {
        return BioFinding::new(
            "warn",
            "bio_missing_symbol",
            "No gene/protein symbol to verify",
            "The claim names no gene or protein symbol, so nothing could be looked up.".to_owned(),
        );
    }
    let organism = organism_or_human(c.organism_id);
    let url = uniprot_search_url(sym, organism, true);
    let hit = match fetch_json(client, &url) {
        Some(body) => parse_uniprot(&body).or_else(|| {
            // Fall back to unreviewed entries before concluding non-existence.
            fetch_json(client, &uniprot_search_url(sym, organism, false)).and_then(|b| parse_uniprot(&b))
        }),
        None => return unreachable_warn("bio_uniprot_unreachable", "UniProt", c),
    };
    match hit {
        Some(h) => BioFinding::new(
            "ok",
            "bio_entity_exists",
            &format!("{sym} exists in UniProt"),
            format!(
                "UniProt resolves '{sym}' to {} ({}, taxon {}). Source: UniProt {}.",
                h.accession, h.organism, h.taxon_id, h.accession
            ),
        ),
        None => BioFinding::new(
            "error",
            "bio_entity_not_found",
            &format!("{sym} not found in UniProt"),
            format!(
                "UniProt returns no gene/protein '{sym}' for organism {organism}. The entity as named \
                 may be a typo, an outdated symbol, or not exist. Statement: {}",
                short(&c.statement)
            ),
        ),
    }
}

fn check_go_term(client: &reqwest::blocking::Client, c: &BioClaim) -> BioFinding {
    let id = c.go_id.trim();
    if id.is_empty() {
        return BioFinding::new(
            "warn",
            "bio_go_no_id",
            "Gene Ontology term stated without an id",
            format!(
                "The claim names a GO term ('{}') but no GO id, so it cannot be resolved against the \
                 ontology. Cite the GO id to verify.",
                short(&c.term)
            ),
        );
    }
    if !go_id_wellformed(id) {
        return BioFinding::new(
            "error",
            "bio_go_malformed",
            &format!("Malformed GO id '{id}'"),
            "A GO id must be 'GO:' followed by seven digits; this one is not, so it cannot denote a \
             real term."
                .to_owned(),
        );
    }
    match fetch_json(client, &quickgo_url(id)) {
        Some(body) => match parse_quickgo(&body) {
            Some(h) if h.obsolete => BioFinding::new(
                "warn",
                "bio_go_obsolete",
                &format!("{id} is obsolete"),
                format!("QuickGO reports {id} ('{}') as obsolete; use a current term.", h.name),
            ),
            Some(h) => BioFinding::new(
                "ok",
                "bio_go_exists",
                &format!("{id} is a valid GO term"),
                format!("QuickGO resolves {id} to '{}'. Source: QuickGO ontology.", h.name),
            ),
            None => BioFinding::new(
                "error",
                "bio_go_not_found",
                &format!("{id} is not a known GO term"),
                format!(
                    "QuickGO returns no term for {id}; the id does not denote a real Gene Ontology term. \
                     Statement: {}",
                    short(&c.statement)
                ),
            ),
        },
        // QuickGO returns 404 for an unknown id, which `fetch_json` maps to None.
        // We cannot tell 404 from a transport failure here, so degrade to warn.
        None => unreachable_warn("bio_go_unreachable", "QuickGO", c),
    }
}

fn check_gene_pathway(client: &reqwest::blocking::Client, c: &BioClaim) -> BioFinding {
    let sym = c.symbol.trim();
    let pathway = c.pathway.trim();
    if sym.is_empty() || pathway.is_empty() {
        return BioFinding::new(
            "warn",
            "bio_pathway_incomplete",
            "Gene→pathway claim missing gene or pathway",
            "A gene→pathway check needs both a gene symbol and a pathway; one is absent.".to_owned(),
        );
    }
    let organism = organism_or_human(c.organism_id);
    // Resolve the gene to an accession first; a gene that does not exist is the
    // one case we can call an error without risking a Reactome coverage gap.
    let hit = match fetch_json(client, &uniprot_search_url(sym, organism, true)) {
        Some(body) => parse_uniprot(&body)
            .or_else(|| fetch_json(client, &uniprot_search_url(sym, organism, false)).and_then(|b| parse_uniprot(&b))),
        None => return unreachable_warn("bio_uniprot_unreachable", "UniProt", c),
    };
    let Some(hit) = hit else {
        return BioFinding::new(
            "error",
            "bio_entity_not_found",
            &format!("{sym} not found in UniProt"),
            format!("UniProt returns no gene '{sym}' for organism {organism}, so the claimed pathway membership cannot hold."),
        );
    };
    match fetch_json(client, &reactome_mapping_url(&hit.accession, organism)) {
        Some(body) => {
            let hits = parse_reactome(&body);
            if hits.is_empty() {
                return BioFinding::new(
                    "warn",
                    "bio_pathway_unmapped",
                    &format!("Reactome lists no pathways for {sym}"),
                    format!(
                        "Reactome maps no pathways to {} ({sym}); the membership in '{pathway}' could not be \
                         confirmed (Reactome coverage is incomplete — this is not a disproof).",
                        hit.accession
                    ),
                );
            }
            match pathway_matches(&hits, pathway) {
                Some(p) => BioFinding::new(
                    "ok",
                    "bio_pathway_confirmed",
                    &format!("{sym} is in '{}'", p.name),
                    format!(
                        "Reactome confirms {} ({sym}) participates in '{}' ({}). Source: Reactome.",
                        hit.accession, p.name, p.st_id
                    ),
                ),
                None => BioFinding::new(
                    "warn",
                    "bio_pathway_not_listed",
                    &format!("{sym} not listed in '{pathway}'"),
                    format!(
                        "Reactome maps {} ({sym}) to {} pathway(s), none matching '{pathway}'. Verify the claim \
                         against the cited source; Reactome absence is not disproof.",
                        hit.accession,
                        hits.len()
                    ),
                ),
            }
        }
        None => unreachable_warn("bio_reactome_unreachable", "Reactome", c),
    }
}

/// Truncate a report sentence for evidence so a long paragraph does not bloat
/// the finding.
fn short(s: &str) -> String {
    let t = s.trim();
    if t.chars().count() <= 160 {
        return t.to_owned();
    }
    let cut: String = t.chars().take(157).collect();
    format!("{cut}…")
}

fn check_one(client: &reqwest::blocking::Client, c: &BioClaim) -> BioFinding {
    // License-gated sources are never queried silently, whatever the claim kind.
    if is_license_gated(&c.source) {
        return BioFinding::new(
            "warn",
            "bio_license_gated",
            "Claim needs a license-gated source",
            format!(
                "Verifying '{}' would require {}, which is license-gated; supply a key to enable this \
                 check. It was not queried and not assumed.",
                claim_label(c),
                c.source.trim()
            ),
        );
    }
    match c.kind.trim().to_lowercase().as_str() {
        "protein" | "gene" => check_protein(client, c),
        "go_term" | "go" | "go-term" => check_go_term(client, c),
        "gene_pathway" | "pathway" | "gene-pathway" => check_gene_pathway(client, c),
        other => BioFinding::new(
            "warn",
            "bio_unsupported_kind",
            "Unsupported claim kind",
            format!("Claim kind '{other}' is not one this verifier checks (protein/gene, go_term, gene_pathway)."),
        ),
    }
}

/// Resolve every claim against its live source and return one finding per
/// claim. An empty claim list leaves a single `ok` trace, mirroring the method
/// check, so a run that found nothing to verify still records that it looked.
pub fn evaluate(claims: &[BioClaim]) -> Vec<BioFinding> {
    if claims.is_empty() {
        return vec![BioFinding::new(
            "ok",
            "bio_nothing_to_check",
            "No biological claims to verify",
            "The report stated no gene/protein, GO term, or pathway membership to re-check.".to_owned(),
        )];
    }
    let Some(client) = client() else {
        return vec![BioFinding::new(
            "warn",
            "bio_client_unavailable",
            "Could not create an HTTP client",
            "The plausibility check could not start its network client; no source was queried.".to_owned(),
        )];
    };
    claims.iter().map(|c| check_one(&client, c)).collect()
}

/// Re-check biological claims against live, license-clear registries. Async so
/// the blocking registry GETs run off the UI thread, matching `probe_endpoint_models`.
#[tauri::command]
pub async fn bio_check_evaluate(claims: Vec<BioClaim>) -> Result<Vec<BioFinding>, String> {
    tauri::async_runtime::spawn_blocking(move || evaluate(&claims))
        .await
        .map_err(|e| format!("bio plausibility task failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn go_id_wellformedness() {
        assert!(go_id_wellformed("GO:0006915"));
        assert!(go_id_wellformed("go:0006915"));
        assert!(!go_id_wellformed("GO:6915")); // too short
        assert!(!go_id_wellformed("GO:00069150")); // too long
        assert!(!go_id_wellformed("0006915")); // no prefix
        assert!(!go_id_wellformed("GO:00069A5")); // non-digit
    }

    #[test]
    fn license_gating_detects_gated_sources() {
        assert!(is_license_gated("KEGG pathway hsa04115"));
        assert!(is_license_gated("DisGeNET"));
        assert!(!is_license_gated("Reactome"));
        assert!(!is_license_gated("UniProt"));
    }

    #[test]
    fn parse_uniprot_reads_the_first_hit() {
        // Shape captured live from rest.uniprot.org (2026-07).
        let body = json!({"results":[{
            "primaryAccession":"P04637",
            "uniProtkbId":"P53_HUMAN",
            "organism":{"scientificName":"Homo sapiens","taxonId":9606},
            "genes":[{"geneName":{"value":"TP53"}}]
        }]});
        let hit = parse_uniprot(&body).expect("a hit");
        assert_eq!(hit.accession, "P04637");
        assert_eq!(hit.gene, "TP53");
        assert_eq!(hit.taxon_id, 9606);
        assert_eq!(hit.organism, "Homo sapiens");
    }

    #[test]
    fn parse_uniprot_empty_results_is_none() {
        assert!(parse_uniprot(&json!({"results":[]})).is_none());
        assert!(parse_uniprot(&json!({})).is_none());
    }

    #[test]
    fn parse_quickgo_reads_term_and_obsolete() {
        let body = json!({"numberOfHits":1,"results":[{
            "id":"GO:0006915","isObsolete":false,"name":"apoptotic process"
        }]});
        let hit = parse_quickgo(&body).expect("a term");
        assert_eq!(hit.id, "GO:0006915");
        assert_eq!(hit.name, "apoptotic process");
        assert!(!hit.obsolete);

        let obs = json!({"results":[{"id":"GO:0000001","isObsolete":true,"name":"old"}]});
        assert!(parse_quickgo(&obs).unwrap().obsolete);

        assert!(parse_quickgo(&json!({"numberOfHits":0,"results":[]})).is_none());
    }

    #[test]
    fn parse_reactome_reads_pathways_and_matches() {
        // Shape captured live from reactome.org ContentService (2026-07).
        let body = json!([
            {"stId":"R-HSA-111448","displayName":"Activation of NOXA and translocation to mitochondria","name":["Activation of NOXA and translocation to mitochondria"],"speciesName":"Homo sapiens"},
            {"stId":"R-HSA-5633008","displayName":"TP53 Regulates Transcription of Cell Death Genes","name":["TP53 Regulates Transcription of Cell Death Genes"],"speciesName":"Homo sapiens"}
        ]);
        let hits = parse_reactome(&body);
        assert_eq!(hits.len(), 2);

        // Exact stable-id match.
        assert!(pathway_matches(&hits, "R-HSA-111448").is_some());
        // Case-insensitive substring match on name.
        let m = pathway_matches(&hits, "tp53 regulates transcription of cell death genes").unwrap();
        assert_eq!(m.st_id, "R-HSA-5633008");
        // A pathway the gene is not in does not match.
        assert!(pathway_matches(&hits, "photosynthesis").is_none());
    }

    #[test]
    fn parse_reactome_non_array_is_empty() {
        // Reactome returns a 404 text (not an array) for an unmapped accession.
        assert!(parse_reactome(&json!({"code":404,"reason":"not found"})).is_empty());
        assert!(pathway_matches(&[], "anything").is_none());
    }

    #[test]
    fn urlencoding_escapes_query_characters() {
        assert_eq!(urlencode("gene:TP53 AND reviewed:true"), "gene%3ATP53%20AND%20reviewed%3Atrue");
        assert_eq!(urlencode("GO:0006915"), "GO%3A0006915");
    }

    #[test]
    fn uniprot_url_targets_reviewed_entries_first() {
        let url = uniprot_search_url("TP53", 9606, true);
        assert!(url.contains("rest.uniprot.org"));
        assert!(url.contains("reviewed%3Atrue"));
        assert!(url.contains("organism_id%3A9606"));
    }

    #[test]
    fn empty_claims_leaves_an_ok_trace() {
        let f = evaluate(&[]);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].level, "ok");
        assert_eq!(f[0].rule, "bio_nothing_to_check");
    }

    #[test]
    fn license_gated_claim_warns_without_querying() {
        // No network: is_license_gated short-circuits before any client use, so
        // check_one is safe to call with a throwaway client that is never hit.
        let c = BioClaim {
            kind: "gene_pathway".into(),
            symbol: "TP53".into(),
            pathway: "hsa04115".into(),
            source: "KEGG".into(),
            ..Default::default()
        };
        let client = client().unwrap();
        let f = check_one(&client, &c);
        assert_eq!(f.level, "warn");
        assert_eq!(f.rule, "bio_license_gated");
    }

    #[test]
    fn malformed_go_id_is_an_error_without_network() {
        let c = BioClaim {
            kind: "go_term".into(),
            go_id: "GO:99".into(),
            ..Default::default()
        };
        let client = client().unwrap();
        let f = check_go_term(&client, &c);
        assert_eq!(f.level, "error");
        assert_eq!(f.rule, "bio_go_malformed");
    }

    #[test]
    fn unsupported_kind_warns() {
        let c = BioClaim {
            kind: "quantum_entanglement".into(),
            ..Default::default()
        };
        let client = client().unwrap();
        let f = check_one(&client, &c);
        assert_eq!(f.level, "warn");
        assert_eq!(f.rule, "bio_unsupported_kind");
    }

    #[test]
    fn short_truncates_long_statements() {
        let long = "x".repeat(300);
        let s = short(&long);
        assert!(s.chars().count() <= 158);
        assert!(s.ends_with('…'));
        assert_eq!(short("  trimmed  "), "trimmed");
    }
}
