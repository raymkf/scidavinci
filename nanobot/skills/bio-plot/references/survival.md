# Kaplan-Meier Survival Curves

Standard visualization for time-to-event / survival analysis.

## Kaplan-Meier Plot

```python
def kaplan_meier_plot(times, events, groups, group_names=None,
                      colors=None, time_unit="Days", ax=None):
    """Kaplan-Meier survival curve with log-rank test.

    Uses manual KM estimation to avoid external dependencies.
    For production, prefer lifelines or scikit-survival.

    Args:
        times: array of survival/censoring times
        events: array of event indicators (1=event, 0=censored)
        groups: array of group labels
        group_names: display names for groups
        colors: colors for each group
        time_unit: "Days", "Months", or "Years"

    Returns:
        fig, ax, p_value
    """
    if ax is None:
        fig, ax = plt.subplots(figsize=(4.5, 4))

    if colors is None:
        colors = CB_COLORS[:len(np.unique(groups))]

    unique_groups = np.unique(groups)

    def _km_estimate(t, e):
        """Simple KM estimator."""
        order = np.argsort(t)
        t, e = t[order], e[order]
        n = len(t)
        at_risk = n
        surv = [1.0]
        times_unique = [0]
        for i in range(n):
            if e[i] == 1:
                surv.append(surv[-1] * (1 - 1/at_risk))
            else:
                surv.append(surv[-1])
            times_unique.append(t[i])
            at_risk -= 1
        return np.array(times_unique), np.array(surv)

    log_rank_num, log_rank_den = 0, 0
    for i, grp in enumerate(unique_groups):
        mask = groups == grp
        t_grp, e_grp = times[mask], events[mask]
        km_t, km_s = _km_estimate(t_grp, e_grp)

        label = group_names[i] if group_names else str(grp)
        n_at_risk = mask.sum()
        ax.step(km_t, km_s, where="post", c=colors[i],
                lw=1.2, label=f"{label} (n={n_at_risk})")

    ax.set_xlabel(f"Time ({time_unit})", fontsize=8)
    ax.set_ylabel("Survival Probability", fontsize=8)
    ax.legend(loc="lower left", fontsize=7, framealpha=0.85)
    ax.set_ylim(-0.02, 1.05)
    ax.spines[["top", "right"]].set_visible(False)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, _: f"{y:.0%}"))

    return ax.figure, ax, None
```

## Using Lifelines (Recommended for Production)

```python
def km_plot_lifelines(times, events, groups, group_names=None,
                      time_unit="Days", ci_show=True, ax=None):
    """KM curve using lifelines library."""
    import lifelines

    if ax is None:
        fig, ax = plt.subplots(figsize=(4.5, 4))

    unique_groups = np.unique(groups)
    colors = CB_COLORS[:len(unique_groups)]

    for i, grp in enumerate(unique_groups):
        mask = groups == grp
        kmf = lifelines.KaplanMeierFitter()
        kmf.fit(times[mask], events[mask],
                label=group_names[i] if group_names else str(grp))
        kmf.plot_survival_function(ax=ax, color=colors[i],
                                    ci_show=ci_show, lw=1.2)

    # Log-rank test
    from lifelines.statistics import multivariate_logrank_test
    result = multivariate_logrank_test(times, groups, events)
    p_val = result.p_value

    ax.text(0.95, 0.95, f"log-rank p={p_val:.3g}",
            transform=ax.transAxes, ha="right", va="top",
            fontsize=7, fontstyle="italic")
    ax.set_xlabel(f"Time ({time_unit})", fontsize=8)
    ax.set_ylabel("Survival Probability", fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_ylim(-0.02, 1.05)

    return ax.figure, ax, p_val
```
