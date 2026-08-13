# Activation Fixtures and Activation Evals

This release has a deliberate boundary between deterministic data validation and semantic model evaluation.

## Activation Fixtures are deterministic inputs

An Activation Fixture is a reviewed YAML case with:

```yaml
id: react-derived-state
task: Remove duplicated component state and derive filtered rows from props.
repositorySignals: [src/components/OrdersTable.tsx, react]
expectedBundle: react
reason: The task changes React state derivation.
```

For every implicitly activated Slice A domain bundle, the repository ships at least five positive and five nearby-negative fixtures. The deterministic validator checks:

- required `id`, `task`, `repositorySignals`, `expectedBundle`, and `reason` fields;
- non-empty string values and non-empty signal arrays;
- globally unique fixture IDs;
- references to declared bundles (or `null` for no selected bundle);
- positive polarity: a fixture in a bundle's `positive.yaml` selects that directory bundle;
- negative polarity: a fixture in a bundle's `negative.yaml` does not select that directory bundle;
- the minimum count of five per polarity.

The shipped fixture set deliberately includes nearby negatives such as documentation-only edits, TypeScript-only utilities, test-only changes, conceptual questions belonging to another domain, and non-React templates with `.tsx` extensions. These cases document the intended boundary and guard against treating a file extension as an unconditional trigger.

The validator is structural. It does not invoke an LLM, choose a skill, measure semantic precision, or prove that a harness activates the expected bundle. The correct name is deterministic Activation Fixture validation—not semantic activation testing, not an Activation Eval, and not a model-quality result.

Run the deterministic checks with:

```bash
corepack pnpm test:unit -- tests/unit/bundles.test.ts
corepack pnpm check
```

`validateActivationFixtures()` is also a source-level validator used by the unit contract. The package's runtime bundle loader validates catalog manifests; it does not pretend to run model evaluation.

## Activation Evals are a separate future gate

An Activation Eval must exercise actual model/harness selection behavior against the fixture prompts (or an explicitly versioned equivalent) and record at least the model, harness/version, prompt set, expected labels, observed selections, false-positive and false-negative cases, aggregation, and acceptance threshold. It must be rerunnable independently of catalog parsing and projection tests.

No model-based Activation Eval has been run or claimed for `0.1.0-alpha.0`. No fixture pass is evidence of semantic activation quality. A future eval gate may change support or bundle metadata only after its results are reviewed; deterministic fixture validation remains necessary but is not sufficient.

## Dogfood observations

Human dogfood observations from fresh agent sessions are useful evidence, but they are not automatically Activation Evals. Record the exact toolkit version, adapter knowledge version, harness/model, prompt, actual activation, missed activation, and overactivation. Do not promote a rule, bundle, or adapter to stable support from one observation.

## Maintainer rule

When adding or changing a fixture, preserve the two boundaries:

1. Make the YAML case structurally valid and keep positive/negative polarity mechanically checkable.
2. If the claim is about what a model or harness selects, create or update the separate model-based eval record; do not encode that claim in a deterministic unit-test description.
