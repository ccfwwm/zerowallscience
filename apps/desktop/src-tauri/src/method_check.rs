// MethodChoiceVerifier — the deterministic core of RV-Loop's method-fit check.
//
// Claude Science's Reviewer explicitly does *not* judge whether the analysis
// method was the right choice for the data. This module does, and it does so
// without a model: given a structured description of the design, outcome, and
// the test/model actually used, it applies a fixed set of statistical-fitness
// rules and returns findings. kimi-k3's job upstream is only to *extract* this
// context from a free-text plan/report and to *explain* each verdict — the
// verdict itself is reproducible and never hallucinated.
//
// The rules are Rust, not an external DSL: the rule set is small, stable, and
// has no user-customization requirement, so encoding it as data + a YAML engine
// would add a dependency and an interpreter to express what a `match` already
// says plainly — and `cargo test` covers every branch. New rules are new arms
// here, guarded by tests.

use serde::{Deserialize, Serialize};

/// A structured description of one analysis, as extracted from a plan or report.
/// Every field is optional/defaulted: a caller that only knows the design and
/// the test still gets the rules that apply to what it does know, rather than an
/// error. Free-text fields are matched case-insensitively by keyword, so
/// "paired t-test", "Paired T Test", and "paired t‑test" all read the same.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodContext {
    /// Study design, e.g. "paired", "repeated measures", "independent groups".
    #[serde(default)]
    pub design: String,
    /// Outcome/data type, e.g. "continuous", "binary", "count", "categorical".
    #[serde(default)]
    pub outcome_type: String,
    /// Number of groups/conditions compared, when stated.
    #[serde(default)]
    pub groups: Option<u32>,
    /// Total sample size, when stated.
    #[serde(default)]
    pub sample_size: Option<u32>,
    /// What was checked about the outcome distribution: "assumed", "unknown",
    /// "tested_normal", or "tested_nonnormal".
    #[serde(default)]
    pub normality: Option<String>,
    /// The test or model actually used, e.g. "independent t-test",
    /// "linear regression", "Mann-Whitney U".
    #[serde(default)]
    pub test_used: String,
    /// Number of hypothesis tests / comparisons made, when stated.
    #[serde(default)]
    pub n_comparisons: Option<u32>,
    /// Whether a multiple-comparison correction was applied, when stated.
    #[serde(default)]
    pub correction_applied: Option<bool>,
}

/// One method-fit verdict. `level` is the shared verification vocabulary
/// (`ok` | `warn` | `error`) so it drops straight into a `verification_checks`
/// row and a reviewer card. `rule` is the stable id of the rule that fired.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodFinding {
    pub level: String,
    pub rule: String,
    pub title: String,
    pub evidence: String,
}

impl MethodFinding {
    fn new(level: &str, rule: &str, title: &str, evidence: String) -> Self {
        Self {
            level: level.to_owned(),
            rule: rule.to_owned(),
            title: title.to_owned(),
            evidence,
        }
    }
}

/// Case-insensitive "contains any of these keywords".
fn has_any(haystack: &str, needles: &[&str]) -> bool {
    let lower = haystack.to_lowercase();
    needles.iter().any(|n| lower.contains(n))
}

fn is_ttest(test: &str) -> bool {
    has_any(test, &["t-test", "t test", "ttest", "student"])
}
fn is_anova(test: &str) -> bool {
    has_any(test, &["anova", "analysis of variance"])
}
fn is_paired_test(test: &str) -> bool {
    has_any(
        test,
        &["paired", "wilcoxon signed", "signed-rank", "signed rank", "repeated measures", "mcnemar"],
    )
}
fn is_independent_test(test: &str) -> bool {
    has_any(
        test,
        &["independent", "unpaired", "two-sample", "two sample", "mann-whitney", "mann whitney", "welch"],
    )
}
fn is_nonparametric(test: &str) -> bool {
    has_any(
        test,
        &[
            "mann-whitney", "mann whitney", "wilcoxon", "kruskal", "spearman", "chi-square",
            "chi square", "chi2", "fisher", "logistic", "friedman", "mcnemar",
        ],
    )
}
fn is_parametric(test: &str) -> bool {
    is_ttest(test)
        || is_anova(test)
        || has_any(test, &["pearson", "linear regression", "ols", "z-test", "z test"])
}
/// Methods that assume a continuous, roughly linear outcome.
fn is_continuous_method(test: &str) -> bool {
    is_ttest(test) || is_anova(test) || has_any(test, &["pearson", "linear regression", "ols"])
}

fn design_is_paired(design: &str) -> bool {
    has_any(design, &["paired", "repeated", "within", "matched", "pre-post", "pre/post", "crossover"])
}
fn design_is_independent(design: &str) -> bool {
    has_any(design, &["independent", "unpaired", "between", "two-group", "two group", "parallel"])
}

fn outcome_is_binary(outcome: &str) -> bool {
    has_any(outcome, &["binary", "dichotom", "yes/no", "yes-no"])
}

fn normality_tested_nonnormal(normality: &str) -> bool {
    let l = normality.to_lowercase();
    l.contains("nonnormal") || l.contains("non-normal") || l.contains("non normal") || l.contains("skewed")
}
fn normality_unverified(normality: &str) -> bool {
    let l = normality.to_lowercase();
    l.is_empty() || l.contains("unknown") || l.contains("assumed") || l.contains("not tested")
}

/// Apply every method-fit rule to `ctx`, returning one finding per rule that
/// fires. When nothing fires, returns a single `ok` finding so the check always
/// leaves a trace ("we looked, and the method fits the description").
pub fn evaluate(ctx: &MethodContext) -> Vec<MethodFinding> {
    let mut out = Vec::new();
    let test = ctx.test_used.trim();

    // R1: a paired/repeated design analyzed with an independent-samples test
    // ignores the within-subject pairing — a real error, not a nitpick.
    if design_is_paired(&ctx.design) && is_independent_test(test) && !is_paired_test(test) {
        out.push(MethodFinding::new(
            "error",
            "paired_design_independent_test",
            "Paired design analyzed with an independent-samples test",
            format!(
                "Design is paired/repeated-measures but the test used ('{test}') treats the groups as \
                 independent, discarding the pairing. Use a paired test (paired t-test or Wilcoxon signed-rank)."
            ),
        ));
    }

    // R2: the mirror — an independent design with a paired test invents a
    // pairing that does not exist.
    if design_is_independent(&ctx.design) && is_paired_test(test) {
        out.push(MethodFinding::new(
            "error",
            "independent_design_paired_test",
            "Independent design analyzed with a paired test",
            format!(
                "Design has independent groups but the test used ('{test}') assumes paired/matched \
                 observations. Use an independent-samples test (independent t-test or Mann-Whitney U)."
            ),
        ));
    }

    // R3: many comparisons with no stated correction inflates the false-positive
    // rate — the single most common analysis-integrity gap.
    if ctx.n_comparisons.is_some_and(|n| n > 1) && ctx.correction_applied != Some(true) {
        let n = ctx.n_comparisons.unwrap();
        out.push(MethodFinding::new(
            "warn",
            "multiple_comparisons_uncorrected",
            "Multiple comparisons without correction",
            format!(
                "{n} comparisons were made with no multiple-comparison correction stated; the \
                 family-wise false-positive rate is inflated. Apply Bonferroni/Holm or report an FDR."
            ),
        ));
    }

    // R4: a distribution tested non-normal but analyzed with a parametric test.
    if let Some(normality) = ctx.normality.as_deref() {
        if normality_tested_nonnormal(normality) && is_parametric(test) && !is_nonparametric(test) {
            out.push(MethodFinding::new(
                "warn",
                "nonnormal_parametric_test",
                "Parametric test on a non-normal distribution",
                format!(
                    "The outcome was found non-normal but '{test}' assumes normality. Use a \
                     nonparametric alternative (Mann-Whitney/Wilcoxon/Kruskal-Wallis) or a justified transform."
                ),
            ));
        }
    }

    // R5: a binary outcome pushed through a continuous/linear method.
    if outcome_is_binary(&ctx.outcome_type) && is_continuous_method(test) {
        out.push(MethodFinding::new(
            "warn",
            "binary_outcome_linear_method",
            "Binary outcome analyzed with a continuous method",
            format!(
                "The outcome is binary but '{test}' models a continuous response. Use logistic \
                 regression or a chi-square/Fisher exact test."
            ),
        ));
    }

    // R6: more than two groups compared pairwise with a t-test instead of a
    // single omnibus test.
    if ctx.groups.is_some_and(|g| g > 2) && is_ttest(test) && !is_anova(test) {
        let g = ctx.groups.unwrap();
        out.push(MethodFinding::new(
            "warn",
            "multigroup_ttest",
            "More than two groups compared with a t-test",
            format!(
                "{g} groups were compared with a t-test. Use an omnibus test (ANOVA or Kruskal-Wallis) \
                 and correct any pairwise follow-ups."
            ),
        ));
    }

    // R7: a small sample with unverified normality under a parametric test — the
    // regime where the normality assumption actually bites.
    if let Some(n) = ctx.sample_size {
        let normality = ctx.normality.as_deref().unwrap_or("");
        if n < 30 && normality_unverified(normality) && is_parametric(test) && !is_nonparametric(test) {
            out.push(MethodFinding::new(
                "warn",
                "small_sample_unverified_normality",
                "Small sample with unverified normality under a parametric test",
                format!(
                    "Sample size is small (n={n}) and normality was not established, yet '{test}' \
                     relies on it. Test normality or use a nonparametric/exact method."
                ),
            ));
        }
    }

    if out.is_empty() {
        out.push(MethodFinding::new(
            "ok",
            "method_fit",
            "Method choice consistent with the data",
            "No method-fit rule was violated for the described design, outcome, and test.".to_owned(),
        ));
    }
    out
}

/// Evaluate a method context and return the findings. Deterministic and pure;
/// the `Result` is only to match the app's command signature convention.
#[tauri::command]
pub fn method_check_evaluate(context: MethodContext) -> Result<Vec<MethodFinding>, String> {
    Ok(evaluate(&context))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> MethodContext {
        MethodContext::default()
    }

    fn rules(findings: &[MethodFinding]) -> Vec<&str> {
        findings.iter().map(|f| f.rule.as_str()).collect()
    }

    #[test]
    fn a_clean_context_yields_a_single_ok_trace() {
        let mut c = ctx();
        c.design = "independent groups".into();
        c.outcome_type = "continuous".into();
        c.test_used = "independent t-test".into();
        c.normality = Some("tested_normal".into());
        let f = evaluate(&c);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].level, "ok");
        assert_eq!(f[0].rule, "method_fit");
    }

    #[test]
    fn paired_design_with_independent_test_is_an_error() {
        let mut c = ctx();
        c.design = "repeated measures (pre-post)".into();
        c.test_used = "independent t-test".into();
        let f = evaluate(&c);
        assert!(rules(&f).contains(&"paired_design_independent_test"));
        assert_eq!(f[0].level, "error");
    }

    #[test]
    fn a_paired_test_on_a_paired_design_does_not_fire_r1() {
        let mut c = ctx();
        c.design = "paired".into();
        c.test_used = "paired t-test".into();
        let f = evaluate(&c);
        assert!(!rules(&f).contains(&"paired_design_independent_test"));
    }

    #[test]
    fn independent_design_with_paired_test_is_an_error() {
        let mut c = ctx();
        c.design = "two independent groups".into();
        c.test_used = "paired t-test".into();
        let f = evaluate(&c);
        assert!(rules(&f).contains(&"independent_design_paired_test"));
    }

    #[test]
    fn many_comparisons_without_correction_warns_but_with_it_does_not() {
        let mut c = ctx();
        c.n_comparisons = Some(12);
        assert!(rules(&evaluate(&c)).contains(&"multiple_comparisons_uncorrected"));
        c.correction_applied = Some(true);
        assert!(!rules(&evaluate(&c)).contains(&"multiple_comparisons_uncorrected"));
    }

    #[test]
    fn nonnormal_distribution_with_parametric_test_warns() {
        let mut c = ctx();
        c.normality = Some("tested_nonnormal".into());
        c.test_used = "one-way ANOVA".into();
        assert!(rules(&evaluate(&c)).contains(&"nonnormal_parametric_test"));

        // A nonparametric test on the same non-normal data is fine.
        c.test_used = "Kruskal-Wallis".into();
        assert!(!rules(&evaluate(&c)).contains(&"nonnormal_parametric_test"));
    }

    #[test]
    fn binary_outcome_with_linear_regression_warns() {
        let mut c = ctx();
        c.outcome_type = "binary".into();
        c.test_used = "linear regression".into();
        assert!(rules(&evaluate(&c)).contains(&"binary_outcome_linear_method"));

        c.test_used = "logistic regression".into();
        assert!(!rules(&evaluate(&c)).contains(&"binary_outcome_linear_method"));
    }

    #[test]
    fn three_groups_with_a_ttest_warns_but_anova_does_not() {
        let mut c = ctx();
        c.groups = Some(3);
        c.test_used = "t-test".into();
        assert!(rules(&evaluate(&c)).contains(&"multigroup_ttest"));

        c.test_used = "one-way ANOVA".into();
        assert!(!rules(&evaluate(&c)).contains(&"multigroup_ttest"));
    }

    #[test]
    fn small_sample_with_unverified_normality_warns() {
        let mut c = ctx();
        c.sample_size = Some(8);
        c.test_used = "t-test".into();
        // normality unset ⇒ unverified
        assert!(rules(&evaluate(&c)).contains(&"small_sample_unverified_normality"));

        c.normality = Some("tested_normal".into());
        assert!(!rules(&evaluate(&c)).contains(&"small_sample_unverified_normality"));
    }

    #[test]
    fn keyword_matching_is_case_and_spacing_insensitive() {
        let mut c = ctx();
        c.design = "PAIRED".into();
        c.test_used = "Independent T Test".into();
        assert!(rules(&evaluate(&c)).contains(&"paired_design_independent_test"));
    }
}
