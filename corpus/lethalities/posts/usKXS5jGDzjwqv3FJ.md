This is our current distillation of the [sharp left turn](https://www.lesswrong.com/posts/GNhMPAWcfBCASy8e6/a-central-ai-alignment-problem-capabilities-generalization) threat model and an attempt to make it more concrete. We will discuss our understanding of the claims made in this threat model, and propose some mechanisms for how a sharp left turn could happen. This is a work in progress, and we welcome feedback and corrections. 

What are the main claims of the “sharp left turn” threat model?
---------------------------------------------------------------

**Claim 1. Capabilities will generalize far (i.e., to many domains)**

There is an AI system that:

*   Performs well: it can accomplish impressive feats, or achieve high scores on valuable metrics.
*   Generalizes, i.e., performs well in new domains, which were not optimized for during training, with no domain-specific tuning.

Generalization is a key component of this threat model because we're not going to directly train an AI system for the task of disempowering humanity, so for the system to be good at this task, the capabilities it develops during training need to be more broadly applicable. 

Some optional sub-claims can be made that increase the risk level of the threat model:

**Claim 1a \[Optional\]: Capabilities (in different "domains") will all generalize at the same time**

**Claim 1b \[Optional\]: Capabilities will generalize far in a discrete phase transition (rather than continuously)** 

**Claim 2. Alignment techniques that worked previously will fail during this transition**

*   Qualitatively different alignment techniques are needed. The ways the techniques work apply to earlier versions of the AI technology, but not to the new version because the new version gets its capability through something new, or jumps to a qualitatively higher capability level (even if through “scaling” the same mechanisms).

**Claim 3: Humans can’t intervene to prevent or align this transition** 

*   Path 1: humans don't notice because it's too fast (or they aren’t paying attention)
*   Path 2: humans notice but are unable to make alignment progress in time
*   Some combination of these paths, as long as the end result is insufficiently correct alignment

Arguments for the claims in this threat model
---------------------------------------------

*   Claim 1: There is a "core" of general intelligence - a most effective way of updating beliefs and selecting actions (Ruin #22). Speculation about what the core is: consequentialism /  EU maximization / "doing things for reasons". 
*   Claim 1a: Capability gains from intelligence are highly correlated (Ruin #15)
*   Claim 2: There is no simple core for alignment (Ruin #22), Corrigibility is anti-natural (Ruin #23)
*   Claims 1 & 2: arguments in [Will capabilities generalize more?](https://www.lesswrong.com/posts/cq5x4XDnLcBrYbb66/will-capabilities-generalise-more) (\+ Ruin #21)
*   Claim 3: We can't coordinate to avoid AGI (Ruin #4)

Mechanisms for capabilities generalizing far (Claim 1)
------------------------------------------------------

Capabilities will generalize far if learning / reasoning / cognitive work is done outside of the optimization process, similarly to how human cultural evolution happens outside genetic evolution and proceeds faster. Here are some mechanisms for cognitive work getting done outside the optimization process:

*   [Mechanisms proposed by Paul Christiano](https://www.lesswrong.com/posts/3pinFH3jerMzAvmza/on-how-various-plans-miss-the-hard-bits-of-the-alignment?commentId=qdkKysrRTs8joWRsf): performing search internally, natural selection occurring internally, reasoning about how to think better, deploying subagents
*   The AI develops a way to outpace SGD as the way to learn / improve, similar to how humans outpace evolution by cultural transmission + within-lifetime learning. E.g., it writes Google docs to itself, or searches over prompts (or whatever is the prompt analog at that point). 
*   The optimization process finds a general meta-learning algorithm, which replaces the previous solution of domain-specific heuristics and greatly increases the rate of learning
*   Sequential reasoning: sharp increase in effective sequential memory/cognitive time between the "aligned" regime and the sharp left turn regime. Ways in which this can happen:
    *   The model is just given access to memory. Its knowledge grows over time, and reaches a critical point which causes a sharp left turn. Alignment schemes before the critical point appear to work, but not after.
    *   We try to restrict the model's memory, but fail. E.g. the model's outputs are used in the world, and the subsequent inputs carry information about previous outputs.
    *   Some input causes the model to access a new faster mode of thinking (e.g. an explanation of how to do step-by-step reasoning in some domain). The same compute that on previous inputs powered e.g. one subjective day of thinking on this new input now powers one subjective week of thinking. This allows the model to evade alignment schemes.

Mechanisms for a rapid phase transition (Claim 1b)
--------------------------------------------------

A rapid phase transition happens if there is a capability overhang: the AI system is improving at various skills continuously, but its improvement in many domains is bottlenecked on one specific skill, and at some point it receives some input that makes its existing capabilities much more effective. Here are some ways this can happen: 

*   The system acquires situational awareness, and now its world model includes understanding of the system’s place in the world and how its training and deployment works. It can plan using this knowledge, which leads to more effective use of existing capabilities. 
*   Analogy to few-shot prompting: the capabilities are already present in the trained artifact. Any alignment technique that goes through gradient updates becomes irrelevant. Putting the artifact into the “right” situation (e.g., giving it a few-shot prompt) reveals its capabilities relevant to this situation. Mechanism: the relevant knowledge and capabilities are installed by some generic pretraining optimisation process.
*   Discovering a more effective way to make use of low quality data leads to more effective use of existing capabilities. 

We will discuss mechanisms for Claim 2 in a [future post](https://www.lesswrong.com/posts/dfXwJh4X5aAcS8gF5/refining-the-sharp-left-turn-threat-model-part-2-applying).