# Queue explorer

Set an arrival rate and a service time, and see what a single-server queue does with them.

## The shape to remember

Latency does not rise smoothly as a system fills up. It rises slowly, and then it goes vertical
somewhere around 80–90% utilisation. The chart is the point of the tool: at ρ = 0.5 a job waits about
as long as it takes to serve; at ρ = 0.9 it waits nine times that.

The marked line is where your inputs put you.

## The two numbers, and why both are shown

- **Formula** is the closed-form M/M/1 result: exact, instant, and true only under its assumptions
  (arrivals independent and Poisson, service times exponential, one server, infinite queue).
- **Simulation** runs the queue arrival by arrival, using Lindley's recursion, with a seeded random
  number generator.

They should agree to within a percent or two. If they ever disagree by more than that, one of them is
wrong, and that is worth knowing, which is why the difference is displayed rather than hidden. More
samples narrow the gap; it shrinks with the square root of the sample count, so ten times the samples
buys about three times the precision.

## Notes

- The random seed is an input, so the same numbers always produce the same simulation. A simulation
  nobody can reproduce is a simulation nobody can check.
- Above ρ = 1 there is no steady state at all: the queue never drains and every average is infinite.
  The tool says so rather than printing a very large number.
- Real systems are worse than this model, not better: service times with high variance, bursty
  arrivals and shared resources all push the knee to the left.
