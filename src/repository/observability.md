---
order: 14
title: Observability
description: How the repository reports on itself - one instrumentation point that feeds logs, metrics and traces at once; the Micrometer naming convention and the tags it keeps off your meters; the Actuator and Prometheus endpoints; and the OTLP tracing you switch on with two settings.
---

A repository you run in anger needs to tell you what it is doing: which uploads were rejected, how
often a proxy leg misses its cache, how many sign-ins failed. Jenesis Repository is a Spring Boot
application, so it reports through the standard **Actuator** endpoints and the **Micrometer**
metric façade - nothing bespoke to learn. What is worth knowing is how it wires those together, and
which two settings turn distributed tracing on.

## One instrumentation point, three signals

Every meaningful operation in the server - a proxy fetch, a publish decision, an import, a console
action - is wrapped once, at a single instrumentation point, as a **Micrometer observation**. From
that one wrap the framework fans out three signals:

- a **log line** when the operation finishes,
- a **metric** (a timer, and a count of errors), and
- a **trace span** - but only when a tracing bridge is on the module path (see *Traces*, below).

You never choose per-call which signals to emit. Instrument once; configure what leaves the process
with the settings at the end of this chapter.

### The naming convention

Observations are named `jenesis.<area>.<signal>` - for example `jenesis.proxy.fetch` for a
pull-through cache leg, or `jenesis.auth.failures` for a denied sign-in. When you scan a metrics or
trace backend, everything the repository itself raises sits under the `jenesis.` prefix; the Spring
and Tomcat meters keep their own.

### High-cardinality context vs. metric tags

Each observation carries the **repository** and **tenant** it ran under. These are recorded as
**high-cardinality key-values**: they ride along on logs and trace spans, where you want to filter by
them, but they are deliberately **kept off the metric tags**. A busy multi-tenant deployment can hold
thousands of repositories, and turning each into a metric dimension would multiply your time series
past what a metrics backend can hold.

What *does* become a metric tag is a small, bounded **outcome**: the proxy-fetch meter is tagged with
its `format` and an `outcome` of `hit`, `miss` or `negative`; a publish observation carries its
verdict; an import carries its source. These are low-cardinality by construction, so grouping a chart
by them stays cheap.

<div class="note">
  An operation that runs before a tenant or repository is resolved - a deployment-wide sweep, a
  request rejected at the door - records <code>none</code> for the missing value rather than failing.
  So a dashboard filter on repository always has something to match.
</div>

## Logs

The logging signal is always on. Each observation logs exactly **one line** when it completes, under
the logger `build.jenesis.observation`, carrying the observation name, its key-values (repository,
tenant, any outcome) and - if the operation failed - the error. A successful operation logs at
`INFO`; a failed one at `WARN`.

Because it is a plain SLF4J logger, you tune it like any other. Raise it to `WARN` to see only
failures, or route it to its own appender:

```properties
logging.level.build.jenesis.observation=WARN
```

When tracing is enabled, each of these lines also carries the current **trace and span ids**, so you
can pivot straight from a log entry to the full trace.

## Metrics

Metrics are exposed through Spring Boot Actuator. By default the server publishes three Actuator
endpoints, over the same HTTP port as the repository:

| Endpoint | Serves |
|----------|--------|
| `/actuator/health` | Liveness and readiness. Kubernetes-style **probes** are enabled; full details show only to an authorised caller. |
| `/actuator/info` | Build and application information. |
| `/actuator/metrics` | The Micrometer meter registry - every `jenesis.*` observation timer plus the JVM, Tomcat and HTTP meters. |

<div class="tip">
  The health probes are never rate-limited, so an aggressive
  <a href="/repository/getting-started/"><code>rate-limit</code></a> setting can never make your
  orchestrator think the server is down.
</div>

Two meters worth watching from day one:

- **`jenesis.proxy.fetch`** - one timer per pull-through leg, tagged by `format` and `outcome`. Chart
  the `miss` and `negative` rates to see how much load your [proxying](/repository/proxying/) is
  actually shedding upstream.
- **`jenesis.auth.failures`** - a running count of denied sign-ins, tagged by mechanism
  (`key` / `oidc` / `saml`) and HTTP status (`401` / `403`). A spike here is your first sign of a
  misconfigured client or a credential-stuffing attempt.

### Prometheus

The base server exposes metrics in Actuator's own JSON. To scrape with **Prometheus**, a distribution
puts a Prometheus registry on the module path and adds `prometheus` to the exposed endpoints:

```properties
management.endpoints.web.exposure.include=health,info,metrics,prometheus
```

Prometheus then scrapes `/actuator/prometheus`, and the same `jenesis.*` meters appear in its text
exposition format with no further wiring.

## Traces

Distributed tracing is **off until you opt in**. The instrumentation is always present - every
observation is span-ready - but a span is only recorded and exported when a **tracing bridge** is on
the module path. With one there, you turn tracing on with the standard Micrometer settings: a sampling
probability, and an **OTLP** endpoint to export spans to.

```properties
# Sample every request while you investigate; dial down in production.
management.tracing.sampling.probability=1.0
# An OpenTelemetry collector speaking OTLP over HTTP.
management.otlp.tracing.endpoint=http://otel-collector:4318/v1/traces
```

Each span carries the same repository and tenant key-values as its log line and inherits the
`jenesis.<area>.<signal>` name, so a trace reads as the operation it measures. And because the log
line now carries the trace id, a warning in your logs links straight to the trace that produced it.

<div class="warning">
  Sampling at <code>1.0</code> traces every request - right for a short investigation, expensive as a
  standing default. Lower <code>management.tracing.sampling.probability</code> to a small fraction once
  you are done, or leave tracing off entirely and rely on metrics and logs.
</div>

## Settings

The observability knobs are the standard Spring Boot properties; set them as system properties
(`-Dmanagement.…`), environment variables, or in the deployment's configuration.

| Key | Default | Meaning |
|-----|---------|---------|
| `management.endpoints.web.exposure.include` | `health,info,metrics` | Which Actuator endpoints are served. Add `prometheus` to expose `/actuator/prometheus`. |
| `management.endpoint.health.probes.enabled` | `true` | Serve separate liveness and readiness probes. |
| `management.endpoint.health.show-details` | `when-authorized` | Show full health detail only to an authorised caller; anonymous callers see up/down alone. |
| `logging.level.build.jenesis.observation` | `INFO` | Verbosity of the one-line-per-operation log. Raise to `WARN` for failures only. |
| `management.tracing.sampling.probability` | `0.0` | Fraction of operations traced. `0` records no spans; `1.0` traces everything. Needs a tracing bridge on the path. |
| `management.otlp.tracing.endpoint` | - | Where to export spans over OTLP. Unset means no export even when sampling is above zero. |

Metrics and logs need no extra infrastructure - they are on the moment the server starts. Tracing is
the one signal that asks for a bridge on the module path and a collector to receive it.
