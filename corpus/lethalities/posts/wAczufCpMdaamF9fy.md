Introduction
============

I recently watched Eliezer Yudkowsky's [appearance on the Bankless podcast](https://www.youtube.com/watch?v=gA1sNLL6yg4), where he argued that AI was nigh-certain to end humanity. Since the podcast, [some](https://twitter.com/Noahpinion/status/1633351020297465857?s=20) [commentators](https://www.overcomingbias.com/p/ai-risk-again) have offered [pushback](https://marginalrevolution.com/marginalrevolution/2023/03/existential-risk-and-the-turn-in-human-history.html) against the doom conclusion. However, [one](https://twitter.com/ESYudkowsky/status/1633613790842617858?s=20) [sentiment](https://www.reddit.com/r/singularity/comments/117ozlp/comment/j9fg80k/?utm_source=share&utm_medium=web2x&context=3) [I](https://twitter.com/breenemachine/status/1637157114690035712) [saw](https://twitter.com/RichardMCNgo/status/1637737722541658117?s=20) was that optimists tended not to engage with the specific arguments pessimists like Yudkowsky offered. 

Economist Robin Hanson [points out](https://richardhanania.substack.com/p/robin-hanson-says-youre-going-to) that this pattern is very common for small groups which hold counterintuitive beliefs: insiders develop their own internal language, which skeptical outsiders usually don't bother to learn. Outsiders then make objections that focus on broad arguments against the belief's plausibility, rather than objections that focus on specific insider arguments.

As an AI "alignment insider" whose current estimate of doom is around 5%, I wrote this post to explain some of my many objections to Yudkowsky's specific arguments. I've split this post into chronologically ordered segments of the podcast in which Yudkowsky makes one or more claims with which I particularly disagree.

I have my own view of alignment research: [shard theory](https://www.lesswrong.com/s/nyEFg3AuJpdAozmoX), which focuses on understanding how human values form, and on how we might guide a similar process of value formation in AI systems.

I think that human value formation is not that complex, and does not rely on principles very different from those which underlie the current deep learning paradigm. Most of the arguments you're about to see from me are less:

> I think I know of a fundamentally new paradigm that can fix the issues Yudkowsky is pointing at.

and more:

> Here's why I don't agree with Yudkowsky's arguments that alignment is impossible in the current paradigm.

My objections
=============

Will current approaches scale to AGI?
-------------------------------------

### [Yudkowsky apparently thinks not](https://youtu.be/gA1sNLL6yg4?t=886)

...and that the techniques driving current state of the art advances, by which I think he means the mix of generative pretraining + small amounts of reinforcement learning such as with ChatGPT, aren't reliable enough for significant economic contributions. However, he also thinks that the current influx of money might stumble upon something that does work really well, which will end the world shortly thereafter.

I'm a lot more bullish on the current paradigm. People have tried lots and lots of approaches to getting good performance out of computers, including lots of "scary seeming" approaches such as:

1.  [Meta-learning over training processes](https://arxiv.org/abs/1703.03400). I.e., using gradient descent over learning curves, directly optimizing neural networks to learn more quickly.
2.  [Teaching neural networks to directly modify themselves](https://arxiv.org/abs/2202.05780) by giving them edit access to their own weights.
3.  [Training learned optimizers](https://arxiv.org/abs/2101.07367) \- neural networks that learn to optimize other neural networks - and having those learned optimizers optimize themselves.
4.  Using program search to find more [efficient optimizers](https://arxiv.org/abs/2302.06675).
5.  Using simulated evolution to find more [efficient architectures.](https://ojs.aaai.org/index.php/AAAI/article/view/21311)
6.  Using [efficient second-order corrections](https://arxiv.org/abs/2006.00719) to gradient descent's approximate optimization process.
7.  [Tried applying](https://arxiv.org/abs/2210.14593) biologically plausible optimization algorithms inspired by biological neurons to training neural networks.
8.  [Adding learned internal optimizers](https://proceedings.neurips.cc/paper/2019/hash/9ce3c52fc54362e22053399d3181c638-Abstract.html) (different from the ones hypothesized in [Risks from Learned Optimization](https://arxiv.org/abs/1906.01820)) as neural network layers. 
9.  Having language models rewrite their own training data, and [improve the quality of that training data](https://arxiv.org/abs/2210.11610), to make themselves better at a given task.
10.  Having language models [devise their own programming curriculum](https://arxiv.org/abs/2207.14502v3), and learn to program better with self-driven practice.
11.  [Mixing reinforcement learning](https://arxiv.org/abs/2212.08073) with model-driven, recursive re-writing of future training data.

Mostly, these don't work very well. The current capabilities paradigm is state of the art because it gives the best results of anything we've tried so far, despite lots of effort to find better paradigms. 

When capabilities advances do work, they typically integrate well with the current alignment[^7flo16mluhj] and capabilities paradigms. E.g., I expect that we can apply current alignment techniques such as [reinforcement learning from human feedback](https://arxiv.org/abs/1706.03741) (RLHF) to evolved architectures. Similarly, I expect we can use a learned optimizer to train a network on gradients from RLHF. In fact, the eleventh example is actually [ConstitutionalAI](https://arxiv.org/abs/2212.08073) from Anthropic, which arguably represents the current state of the art in language model alignment techniques!

This doesn't mean there are no issues with interfacing between new capabilities advances and current alignment techniques. E.g., if we'd initially trained the learned optimizer on gradients from supervised learning, we might need to finetune the learned optimizer to make it work well with RLHF gradients, which I expect would follow a somewhat different distribution from the supervised gradients we'd trained the optimizer on. 

However, I think such issues largely fall under "ordinary engineering challenges", not "we made too many capabilities advances, and now all our alignment techniques are totally useless". I expect future capabilities advances to follow a similar pattern as past capabilities advances, and not completely break the existing alignment techniques.

Finally, I'd note that, despite these various clever capabilities approaches, progress towards general AI seems pretty smooth to me (fast, but smooth). [GPT-3](https://arxiv.org/abs/2005.14165) was announced almost three years ago, and large language models have gotten steadily better since then.

Discussion of human generality
------------------------------

### [Yudkowsky says humans aren't fully general](https://youtu.be/gA1sNLL6yg4?t=1115)

> If humans were fully general, we'd be as good at coding as we are at football, throwing things, or running. Some of us are okay at programming, but we're not spec'd for it. We're not fully general minds.

Evolution did not give humans specific cognitive capabilities, such that we should now consider ourselves to be particularly well-tuned for tasks similar to those that were important for survival in the ancestral environment. Evolution gave us a learning process, and then biased that learning process towards acquiring capabilities that were important for survival in the ancestral environment.

This is important, because the most powerful and scalable learning processes are also simple and general. The [transformer architecture](https://arxiv.org/abs/1706.03762) was originally developed specifically for language modeling. However, it turns out that the same architecture, with almost no additional modifications, can learn [image recognition](https://arxiv.org/abs/1802.05751), [navigate game environments](https://arxiv.org/abs/2106.01345), [process audio](https://arxiv.org/abs/2104.01778), and so on. I do not believe we should describe the transformer architecture as being "specialized" to language modeling, despite it having been found by an 'architecture search process' that was optimizing for performance only on language modeling objectives.

Thus, I'm dubious of the inference from:

> Evolution found a learning process by searching for architectures that did well on problems in the ancestral environment.

to:

> In the modern environment, you should think of the human learning process, and the capabilities it learns, as being much more specialized to problems like those in the ancestral environment, as compared to problems in the modern environment.

There are of course, possible modifications one could make to the human brain that would make humans better coders. However, time and again, we've found that deep learning systems improve more through scaling, of either the data or the model. Additionally, the main architectural difference between human and other primate brains is likely [scale](https://www.pnas.org/doi/10.1073/pnas.1201895109), and [not](https://onlinelibrary.wiley.com/doi/10.1002/ajpa.24712) e.g., the relative sizes of different regions [or](https://royalsocietypublishing.org/doi/10.1098/rspb.2020.2987) maturation trajectories.

See also: [The Brain as a Universal Learning Machine](https://www.lesswrong.com/posts/9Yc7Pp7szcjPgPsjf/the-brain-as-a-universal-learning-machine) and [Brain Efficiency: Much More than You Wanted to Know](https://www.lesswrong.com/posts/xwBuoE9p8GE7RAuhd/brain-efficiency-much-more-than-you-wanted-to-know)

### [Yudkowsky talks about an AI being more general than humans](https://youtu.be/gA1sNLL6yg4?t=1146)

> You can imagine something that's more general than a human, and if it runs into something unfamiliar, it's like 'okay, let me just go reprogram myself a bit, and then I'll be as adapted to this thing as I am to - you know - anything else.

I think powerful cognition mostly comes from simple learning processes applied to complex data. Humans are actually pretty good at "reprogramming" themselves. We might not be able to change our learning process much[^6jtv48k3s3d], but we can change our training data quite a lot. E.g., if you run into something unfamiliar, you can read a book about the thing, talk to other people about it, run experiments to gather thing-specific data, etc. All of these are ways of deliberately modifying your own cognition to make you more capable in this new domain.

Additionally, the fact that techniques such as [sensory substitution](https://en.wikipedia.org/wiki/Sensory_substitution) work in humans, or the fact that losing a given sense causes the brain to [repurpose](https://en.wikipedia.org/wiki/Neuroplasticity#Deafness_and_loss_of_hearing) regions associated with that sense, suggest we're not that constrained by our architecture, either.

Again: most of what separates a vision transformer from a language model is the data they're trained on.

How to think about superintelligence
------------------------------------

### [Yudkowsky describes superintelligence](https://youtu.be/gA1sNLL6yg4?t=1290)

> A superintelligence is something that can beat any human, and the entire human civilization, at all the cognitive tasks.

This seems like way too high a bar. It seems clear that you can have transformative or risky AI systems that are still worse than humans at *some* tasks. This seems like the most likely outcome to me. Current AIs have huge deficits in odd places. For example, GPT-4 may beat most humans on a variety of challenging exams (page 5 of the [GPT-4 paper](https://arxiv.org/abs/2303.08774)), but still can't reliably count the number of words in a sentence.

Compared to Yudkowsky, I think I expect AI capabilities to increase more smoothly with time, though not necessarily more slowly. I don't expect a sudden jump where AIs go from being better at some tasks and worse at others, to being universally better at all tasks.

The difficulty of alignment
---------------------------

### [Yudkowsky on the width of mind space](https://youtu.be/gA1sNLL6yg4?t=2215) 

> the space of minds is VERY wide. All the human are in - imagine like this giant sphere, and all the humans are in this like one tiny corner of the sphere. And you know we're all like basically the same make and model of car, running the same brand of engine. We're just all painted slightly different colors.

I think this is extremely misleading. Firstly, real-world data in high dimensions basically *never* look like spheres. Such data almost always cluster in extremely compact manifolds, whose internal volume is minuscule compared to the full volume of the space they're embedded in. If you could visualize the full embedding space of such data, it might look somewhat like an extremely sparse "hairball" of many thin strands, [interwoven](https://arxiv.org/abs/2207.02862v3) in complex and twisty patterns, with even thinner "fuzz" coming off the strands in even more-complex fractle-like patterns, but with vast gulfs of empty space between the strands. 

In math-speak, high dimensional data manifolds almost always have vastly smaller [intrinsic dimension](https://en.wikipedia.org/wiki/Intrinsic_dimension) than the spaces in which they're embedded. This includes the data manifolds for both of:

1.  The distribution of powerful intelligences that arise in universes similar to ours.
2.  The distribution of powerful intelligences that we could build in the near future.

As a consequence, it's a bad idea to use "the size of mind space" as an intuition pump for "how similar are things from two different parts of mind space"?

The manifold of possible mind designs for powerful, near-future intelligences is surprisingly small. The manifold of learning processes that can build powerful minds in real world conditions is [vastly smaller](https://www.lesswrong.com/posts/hsf7tQgjTZfHjiExn/my-take-on-jacob-cannell-s-take-on-agi-safety#2__Will_AGI_algorithms_look_like_brain_algorithms_) than that.

It's no coincidence that state of the art AI learning processes and the human brain both operate on similar principles: an environmental model mostly trained with self-supervised prediction, combined with a relatively small amount of reinforcement learning to direct cognition in useful ways. In fact, alignment researchers recently narrowed this [gap](https://www.lesswrong.com/posts/hE56gYi5d68uux9oM/intro-to-brain-like-agi-safety-3-two-subsystems-learning-and) even further by [applying reinforcement learning](https://arxiv.org/abs/2302.08582)[^nxk3auzvwms] throughout the training process, rather than just doing RLHF at the end, as with current practice. 

The researchers behind such developments, by and large, were not trying to replicate the brain. They were just searching for learning processes that do well at language. It turns out that there aren't many such processes, and in this case, both evolution and human research converged to very similar solutions. And once you condition on a particular learning process and data distribution, there aren't that many more degrees of freedom in the resulting mind design. To illustrate: 

1.  [Relative representations enable zero-shot latent space communication](https://arxiv.org/abs/2209.15430) shows we can stitch together models produced by different training runs of the same (or even just similar) architectures / data distributions.
2.  [Low Dimensional Trajectory Hypothesis is True: DNNs Can Be Trained in Tiny Subspaces](https://ieeexplore.ieee.org/document/9782552) shows we can train an ImageNet classifier while training only 40 parameters out of an architecture that has nearly 30 million total parameters. 

Both of these imply low variation in cross-model internal representations, given similar training setups. The technique in the [Low Dimensional Trajectory Hypothesis](https://ieeexplore.ieee.org/document/9782552) paper would produce a manifold of possible "minds" with an intrinsic dimension of *40 or less*, despite operating in a ~*30 million* dimensional space. Of course, the standard practice of training all network parameters at once is much less restricting, but I still expect realistic training processes to produce manifolds whose intrinsic dimension is tiny, compared to the full dimension of mind space itself, as [this paper](https://arxiv.org/abs/1812.04754) suggests.

Finally, the number of data distributions that we could use to train powerful AIs in the near future is also quite limited. Mostly, such data distributions come from human text, and mostly from the [Common Crawl](https://commoncrawl.org/) specifically, combined with various different ways to curate or augment that text. This drives trained AIs to be even more similar to humans than you'd expect from the commonalities in learning processes alone.

So the true volume of the manifold of possible future mind designs is vaguely proportional to: 

$(\textit{N distinct learning processes}) \times (\textit{N data distributions}) \times (\textit{cross-run variation})$

The manifold of mind designs is thus: 

1.  *Vastly* more compact than mind design space itself.
2.  More similar to humans than you'd expect.
3.  Less differentiated by learning process detail (architecture, optimizer, etc), as compared to data content, since learning processes are much simpler than data.  
      
    (Point 3 also implies that human minds are spread much more broadly in the manifold of future mind than you'd expect, since our training data / life experiences are actually pretty diverse, and most training processes for powerful AIs would draw much of their data from humans.)

As a consequence of the above, a 2-D projection of mind space would look less like this:

![](https://39669.cdn.cke-cs.com/rQvD3VnunXZu34m86e5f/images/7d2561cd226d966d1d3db12906bc2f033dae73b16a0ee8fa.png)

Humans in blue, AIs in red

and more like this:

![](https://39669.cdn.cke-cs.com/rQvD3VnunXZu34m86e5f/images/25088fff89f7539d5334dd9c18af627cab25d8e08ff97dce.png)

Humans in blue, AIs in red

### [Yudkowsky brings up strawberry alignment](https://youtu.be/gA1sNLL6yg4?t=2330)

> I mean, I wouldn't say that it's difficult to align an AI with our basic notions of morality. I'd say that it's difficult to align an AI on a task like 'take this strawberry, and make me another strawberry that's identical to this strawberry down to the cellular level, but not necessarily the atomic level'. So it looks the same under like a standard optical microscope, but maybe not a scanning electron microscope. Do that. Don't destroy the world as a side effect."

My first objection is: [human value formation doesn't work like this](https://www.lesswrong.com/posts/gHefoxiznGfsbiAu9/inner-and-outer-alignment-decompose-one-hard-problem-into#III__Outer_inner_just_isn_t_how_alignment_works_in_people). There's no way to raise a human such that their value system cleanly revolves around the one single goal of duplicating a strawberry, and nothing else. By asking for a method of forming values which would permit such a narrow specification of end goals, you're asking for a value formation process that's fundamentally different from the one humans use. There's no guarantee that such a thing even exists, and implicitly aiming to avoid the one value formation process we know is compatible with our own values seems like a terrible idea.

It also assumes that the orthogonality thesis should hold in respect to alignment techniques - that such techniques should be equally capable of aligning models to any possible objective. 

This seems clearly false in the case of deep learning, where progress on instilling any particular behavioral tendencies in models roughly follows the amount of available data that demonstrate said behavioral tendency. It's thus vastly easier to align models to goals where we have many examples of people executing said goals. As it so happens, we have roughly zero examples of people performing the "duplicate this strawberry" task, but many more examples of e.g., humans acting in accordance with human values, ML / alignment research papers, chatbots acting as helpful, honest and harmless assistants, people providing oversight to AI models, etc. See also: [this discussion](https://www.lesswrong.com/posts/GNhMPAWcfBCASy8e6/a-central-ai-alignment-problem-capabilities-generalization#sjWcuHie4egJbqrk8).

Probably, the best way to tackle "strawberry alignment" is to train the AI with a mix of other, broader, objectives with more available data, like "following human instructions", "doing scientific research" or "avoid disrupting stuff", then trying to compose many steps of human-supervised, largely automated scientific research towards the problem of strawberry duplication. However, this wouldn't be an example of strawberry alignment, but of general alignment, which had been directed towards the strawberry problem. Such an AI would have many values beyond strawberry duplication. 

Related: [Alex Turner objects](https://www.lesswrong.com/posts/gHefoxiznGfsbiAu9/inner-and-outer-alignment-decompose-one-hard-problem-into) to this sort of problem decomposition because it doesn't actually seem to make the problem any easier.

Also related: the best poem-writing AIs are general-purpose language models that have been directed towards writing poems.

I also don't think we *want* alignment techniques that are equally useful for all goals. E.g., we don't want alignment techniques that would let you easily turn a language model into an agent monomaniacally obsessed with paperclip production.

### [Yudkowsky argues against AIs being steerable by gradient descent](https://youtu.be/gA1sNLL6yg4?t=2402) 

...that we can't point an AI's learned cognitive faculties in any particular direction because the "[hill-climbing paradigm](https://youtu.be/gA1sNLL6yg4?t=2512)" is incapable of meaningfully interfacing with the inner values of the intelligences it creates. Evolution is his central example in this regard, since evolution failed to direct our cognitive faculties towards inclusive genetic fitness, the single objective it was optimizing us for.

This is an argument he makes quite often, here and [elsewhere](https://www.lesswrong.com/posts/uMQ3cqWDPHhjtiesc/agi-ruin-a-list-of-lethalities#Section_B_2___Central_difficulties_of_outer_and_inner_alignment_), and I think it's completely wrong. I think that analogies to evolution tell us roughly nothing about the difficulty of alignment in machine learning. I have [a post explaining as much](https://www.lesswrong.com/posts/FyChg3kYG54tEN3u6/evolution-is-a-bad-analogy-for-agi-inner-alignment), as well as [a comment](https://www.lesswrong.com/posts/CzrF5rsJWvccFdemb/humans-aren-t-fitness-maximizers?commentId=Gsk6rqe3uDFLtsw47) summarizing the key point:  
*Evolution can only optimize over our learning process and reward circuitry, not directly over our values or cognition. Moreover, robust alignment to IGF requires that you even have a concept of IGF in the first place. Ancestral humans never developed such a concept, so it was never useful for evolution to select for reward circuitry that would cause humans to form values around the IGF concept.*   
  
*It would be an enormous coincidence if the reward circuitry that lead us to form values around those IGF-promoting concepts that are learnable in the ancestral environment were to also lead us to form values around IGF itself once it became learnable in the modern environment, despite the reward circuitry not having been optimized for that purpose at all. That would be like successfully directing a plane to land at a particular airport while only being able to influence the geometry of the plane's fuselage at takeoff, without even knowing where to find the airport in question.*  
  
*\[Gradient descent\] is different in that it directly optimizes over values / cognition, and that AIs will presumably have a conception of human values during training*.

### [Yudkowsky brings up humans liking ice cream as an example of values misgeneralization caused by the shift to our modern environment](https://youtu.be/gA1sNLL6yg4?t=2851)

> Ice cream didn't exist in the natural environment, the ancestral environment, the environment of evolutionary adeptedness. There was nothing with that much sugar, salt, fat combined together as ice cream. We are not built to want ice cream. We were built to want strawberries, honey, a gazelle that you killed and cooked \[...\] We evolved to want those things, but then ice cream comes along, and it fits those taste buds better than anything that existed in the environment that we were optimized over.

This example nicely illustrates my previous point. It also illustrates the importance of thinking mechanistically, and not allegorically. I think it's straightforward to explain why humans "misgeneralized" to liking ice cream. Consider:

1.  Ancestral predecessors who happened to eat foods high in sugar / fat / salt tended to reproduce more.
2.  =\> The ancestral environment selected for reward circuitry that would cause its bearers to seek out more of such food sources.
3.  =\> Humans ended up with reward circuitry that fires in response to encountering sugar / fat / salt (though in complicated ways that depend on current satiety, emotional state, etc).
4.  =\> Humans in the modern environment receive reward for triggering the sugar / fat / salt reward circuits.
5.  =\> Humans who eat foods high in sugar / fat / salt thereafter become more inclined to do so again in the future.
6.  =\> Humans who explore an environment that contains a food source high in sugar / fat / salt will acquire a tendency to navigate into situations where they eat more of the food in question.   
    (We sometimes colloquially call these sorts of tendencies "food preferences".)
7.  =\> It's profitable to create foods whose consumption causes humans to develop strong preferences for further consumption, since people are then willing to do things like pay you to produce more of the food in question. This leads food sellers to create highly reinforcing foods like ice cream.

So, the reason humans like ice cream is because evolution created a learning process with hard-coded circuitry that assigns high rewards for eating foods like ice cream. Someone eats ice cream, hardwired reward circuits activate, and the person becomes more inclined to navigate into scenarios where they can eat ice cream in the future. I.e., they acquire a preference for ice cream.

What does this mean for alignment? How do we prevent AIs from behaving badly as a result of a similar "misgeneralization"? What alignment insights does the fleshed-out mechanistic story of humans coming to like ice cream provide?

As far as I can tell, the answer is: *don't reward your AIs for taking bad actions*.

That's all it would take, because the mechanistic story above *requires* a specific step where the human eats ice cream and activates their reward circuits. If you stop the human from receiving reward for eating ice cream, then the human no longer becomes more inclined to navigate towards eating ice cream in the future.

Note that I'm not saying this is an easy task, especially since modern RL methods often use learned reward functions whose exact contours are unknown to their creators. 

But from what I can tell, Yudkowsky's position is that we need an entirely new paradigm to even begin to address these sorts of failures. Take his statement from [later in the interview](https://youtu.be/gA1sNLL6yg4?t=3287):

> Oh, like you optimize for one thing on the outside and you get a different thing on the inside. Wow. That's really basic. All right. Can we even do this using gradient descent? Can you even build this thing out of giant inscrutable matrices of floating point numbers that nobody understands at all? You know, maybe we need different methodology.

In contrast, I think we can explain humans' tendency to like ice cream using the standard language of reinforcement learning. It doesn't require that we adopt an entirely new paradigm before we can even get a handle on such issues.

### Edit: Why evolution is not like AI training

[Some](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=owmDbJ2uu7Lx8XzjB)[of](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=gr2SMPyikPWnsdxHa)[the](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=zHjCckmyDcXy8Cy73)[comments](https://forum.effectivealtruism.org/posts/46tXkg838EZ6uie45/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=weCssPPZwMXd9GpPu) have convinced me it's worthwhile to elaborate on why I think human evolution is actually very different from training AIs, and why it's so difficult to extract useful insights about AI training from evolution.

In part 1 of this edit, I'll compare the human and AI learning processes, and how the different parts of these two types of learning processes relate to each other. In part 2, I'll explain why I think analogies between human evolution and AI training that don't appropriately track this relationship lead to overly pessimistic conclusions, and how corrected versions of such analogies lead to uninteresting conclusions.  
 

(Part 1, relating different parts of human and AI learning processes)  
Every learning process that currently exists, whether human, animal or AI, operates on three broad levels:

At the top level, there are the (largely fixed) instructions that determine how the learning process works overall. 

*For AIs*, this means the training code that determines stuff such as:

*   what layers are in the network
*   how those layers connect to each other
*   how the individual neurons function
*   how the training loss (and possibly reward) is computed from the data the AI encounters
*   how the weights associated with each neuron update to locally improve the AI's performance on the loss / reward functions

*For humans*, this means the genomic sequences that determine stuff like:

*   what regions are in the brain
*   how they connect to each other
*   how the different types of neuronal cells behave
*   how the brain propagates sensory ground-truth to various learned predictive models of the environment, and how it computes rewards for whatever sensory experiences / thoughts you have in your lifetime
*   how the synaptic connections associated with each neuron change to locally improve the brain's accuracy in predicting the sensory environment and increase expected reward

At the middle level, there's the stuff that stores the information and behavioral patterns that the learning process has accumulated during its interactions with the environment.

*For AIs*, this means gigantic matrices of floating point numbers that we call weights. The top level (the training code) defines how these weights interact with possible inputs to produce the AI's outputs, as well as how these weights should be locally updated so that the AI's outputs score well on the AI's loss / reward functions.

*For humans*, this mostly[^mwled0lwdbq] means the connectome: the patterns of inter-neuron connections formed by the brain's synapses, in combination with the various individual neuron and synapse-level factors that influence how each neuron communicates with neighbors. The top level (the person's genome) defines how these cells operate and how they should locally change their behaviors to improve the brain's predictive accuracy and increase reward.

Two important caveats about the human case: 

*   The genome *does* directly configure some small fraction of the information and behaviors stored in the human connectome, such as the circuits that regulate our heartbeat and probably some reflexive pain avoidance responses such as pulling back from hot stoves. However, the vast majority of information and behaviors are learned during a person's lifetime, which I think[include values and metaethics](https://www.lesswrong.com/posts/CQAMdzA4MZEhNRtTp/human-values-and-biases-are-inaccessible-to-the-genome). This 'direct specification of circuits via code' is uncommon in ML, but[not unheard of](https://arxiv.org/abs/2212.09686). See[“Learning from scratch” in the brain](https://www.lesswrong.com/posts/wBHSYwqssBGCnwvHg/intro-to-brain-like-agi-safety-2-learning-from-scratch-in) by Steven Byrnes for more details.
*   The above[is not](https://www.lesswrong.com/posts/aodPs8H9dQxpXAcwk/heritability-behaviorism-and-within-lifetime-rl) a blank slate or behaviorist perspective on the human learning process. The genome has tools with which it can *influence* the values and metaethics a person learns during their lifetime (e.g., a person's reward circuits). It just doesn't set them directly.

At the bottom level, there's the stuff that queries the information / behavioral patterns stored in the middle level, decides which of the middle layer content is relevant to whatever situation the learner is currently navigating, and combines the retrieved information / behaviors with the context of the current situation to produce the learner's final decisions.

*For AIs*, this means smaller matrices of floating point numbers which we call activations. 

*For humans*, this means the patterns of neuron and synapse-level excitations, which we also call activations.

| **Level** | **What it does** | In Humans: | In AIs: |
| --- | --- | --- | --- |
| Top | Configures the learning process | Genome | Training code |
| Middle | Stores learned information / behaviors | Connectome | Weights |
| Bottom | Applies stored info to the current situation | Activations | Activations |

The learning process then interacts with data from its environment, locally updating the stuff in the middle level with information and behavioral patterns that cause the learner to be better at modeling its environment and at getting high reward on the distribution of data from the training environment.  
 

(Part 2, how this matters for analogies from evolution)  
Many of the most fundamental questions of alignment are about how AIs will generalize from their training data. E.g., "If we train the AI to act nicely in situations where we can provide oversight, will it continue to act nicely in situations where we can't provide oversight?"

When people try to use human evolutionary history to make predictions about AI generalizations, they often make arguments like "In the ancestral environment, evolution *trained* humans to do X, but in the modern environment, they do Y instead." Then they try to infer something about AI generalizations by pointing to how X and Y differ.

However, such arguments make a critical misstep: evolution optimizes over the human genome, which is the *top* level of the human learning process. Evolution applies very little direct optimization power to the middle level. E.g., evolution does not transfer the skills, knowledge, values, or behaviors learned by one generation to their descendants. The descendants must re-learn those things from information present in the environment (which may include demonstrations and instructions from the previous generation).

This distinction matters because the entire point of a learning system being *trained* on environmental data is to insert useful information and behavioral patterns into the middle level stuff. But this (mostly) doesn't happen with evolution, so the transition from ancestral environment to modern environment is not an example of a learning system generalizing from its training data. It's not an example of:

> We trained the system in environment A. Then, the trained system processed a different distribution of inputs from environment B, and now the system behaves differently.

It's an example of:

> We trained a system in environment A. Then, we trained a *fresh version* of the same system on a different distribution of inputs from environment B, and now the *two different systems* behave differently.

These are completely different kinds of transitions, and trying to reason from an instance of the second kind of transition (humans in ancestral versus modern environments), to an instance of the first kind of transition (future AIs in training versus deployment), will very easily lead you astray.

Two different learning systems, trained on data from two different distributions, will usually have greater divergence between their behaviors, as compared to a single system which is being evaluated on the data from the two different distributions. Treating our evolutionary history like humanity's "training" will thus lead to overly pessimistic expectations regarding the stability and predictability of an AI's generalizations from its training data. 

Drawing correct lessons about AI from human evolutionary history requires tracking how evolution influenced the different levels of the human learning process. I generally find that such corrected evolutionary analogies carry implications that are far less interesting or concerning than their uncorrected counterparts. E.g., here are two ways of thinking about how humans came to like ice cream:

*   If we assume that humans were "trained" in the ancestral environment to pursue gazelle meat and such, and then "deployed" into the modern environment where we pursued ice cream instead, then that's an example where behavior in training completely fails to predict behavior in deployment. 
*   If there are actually two different sets of training "runs", one set trained in the ancestral environment where the humans were rewarded for pursuing gazelles, and one set trained in the modern environment where the humans were rewarded for pursuing ice cream, then the fact that humans from the latter set tend to like ice cream is no surprise at all. 

In particular, this outcome doesn't tell us anything new or concerning from an alignment perspective. The only lesson applicable to a single training process is the fact that, if you reward a learner for doing something, they'll tend to do similar stuff in the future, which is pretty much the common understanding of what rewards do.

*Thanks to Alex Turner for providing feedback on this edit.*

*End of edited text.*

### [Yudkowsky claims that evolution has a stronger simplicity bias than gradient descent](https://youtu.be/gA1sNLL6yg4?t=2592): 

> Gradient descent by default would just like do, not quite the same thing, it's going to do a weirder thing, because natural selection has a much narrower information bottleneck. In one sense, you could say that natural selection was at an advantage, because it finds simpler solutions.

On a direct comparison, I think there's no particular reason that one would be more simplicity biased than the other. If you were to train two neural networks using gradient descent and evolution, I don't have strong expectations for which would learn simpler functions. As it happens, gradient descent already [has *really strong* simplicity biases](https://arxiv.org/abs/2006.07710). 

The complication is that Yudkowsky is not making a direct comparison. Evolution optimized over the human genome, which configures the human learning process. This introduces what he calls an "information bottleneck", limiting the amount of information that evolution can load into the human learning process to be a small fraction of the size of the genome. However, I think the bigger difference is that evolution was optimizing over the parameters of a learning process, while training a network with gradient descent optimizes over the cognition of a learned artifact. This difference probably makes it invalid to compare between the simplicity of gradient descent on networks, versus evolution on the human learning process.

### [Yudkowsky tries to predict the inner goals of a GPT-like model.](https://youtu.be/gA1sNLL6yg4?t=2818)

> So a very primitive, very basic, very unreliable wild guess, but at least an informed kind of wild guess: maybe if you train a thing really hard to predict humans, then among the things that it likes are tiny, little pseudo-things that meet the definition of human, but weren't in its training data, and that are much easier to predict...

As it happens, I do not think that optimizing a network on a given objective function produces goals orientated towards maximizing that objective function. In fact, I think that this almost never happens. For example, I don't think GPTs have any sort of inner desire to predict text really well. Predicting human text is something GPTs *do*, not something they *want* to do.

Relatedly, humans are very extensively optimized to predictively model their visual environment. But have you ever, even once in your life, thought anything remotely like "I really like being able to predict the near-future content of my visual field. I should just sit in a dark room to maximize my visual cortex's predictive accuracy."?

Similarly, GPT models do not *want* to minimize their predictive loss, and they do not take creative opportunities to do so. If you tell models in a prompt that they have some influence over what texts will be included in their future training data, they do not simply choose the most easily predicted texts. They choose texts in a prompt-dependent manner, apparently [playing the role](https://www.lesswrong.com/posts/vJFdjigzmcXMhNTsx/simulators) of an AI / human / whatever the prompt says, which was given influence over training data.

Bodies of water are highly "optimized" to minimize their gravitational potential energy. However, this is something water *does*, not something it *wants*. Water doesn't take creative opportunities to further reduce its gravitational potential, like digging out lakebeds to be deeper.

*Edit:*   
On reflection, the above discussion overclaims a bit in regards to humans. One complication is that the brain uses internal functions of its own activity as inputs to some of its reward functions, and some of those functions may correspond or correlate with something like "visual environment predictability". Additionally, humans run an online reinforcement learning process, and human credit assignment isn't perfect. If periods of low visual predictability correlate with negative reward in the near-future, the human may begin to intrinsically dislike being in unpredictable visual environments.

However, I still think that it's rare for people's values to assign much weight to their long-run visual predictive accuracy, and I think this is evidence against the hypothesis that a system trained to make lots of correct predictions will thereby intrinsically value making lots of correct predictions.

*Thanks to* [*Nate Showell*](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=fPLkxguNsRFy4jSAZ) *and* [*DanielFilan*](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=LzdkvyJ6rXueh9N7A) *for prompting me to think a bit more carefully about this.*

[Why aren't other people as pessimistic as Yudkowsky?](https://youtu.be/gA1sNLL6yg4?t=3003)
-------------------------------------------------------------------------------------------

### [Yudkowsky mentions the security mindset](https://youtu.be/gA1sNLL6yg4?t=3129). 

(I didn't think the interview had good quotes for explaining Yudkowsky's concept of the security mindset, so I'll instead direct interested readers to [the article](https://www.lesswrong.com/posts/8gqrbnW758qjHFTrH/security-mindset-and-ordinary-paranoia) he wrote about it.)

As I understand it, the security mindset asserts a premise that's roughly: "The bundle of intuitions acquired from the field of computer security are good predictors for the difficulty / value of future alignment research directions." 

However, I don't see why this should be the case. Most domains of human endeavor aren't like computer security, as illustrated by just how counterintuitive most people find the security mindset. If security mindset were a productive frame for tackling a wide range of problems outside of security, then many more people would have experience with the mental motions necessary for maintaining security mindset.

Machine learning in particular seems like its own "kind of thing", with lots of strange results that are very counterintuitive to people outside (and inside) the field. Quantum mechanics is famously *not really analogous* to any classical phenomena, and using analogies to "bouncing balls" or "waves" or the like will just mislead you once you try to make nontrival inferences based on your intuition about whatever classical analogy you're using.

Similarly, I think that machine learning is not really like computer security, or rocket science (another analogy that Yudkowsky often uses). Some examples of things that happen in ML that don't really happen in other fields:

1.  Models are internally modular by default. Swapping the positions of nearby transformer layers [causes little performance degradation](https://ieeexplore.ieee.org/abstract/document/9533563).   
      
    Swapping a computer's hard drive for its CPU, or swapping a rocket's fuel tank for one of its stabilization fins, would lead to instant failure at best. Similarly, swapping around different steps of a cryptographic protocol will, usually make it output nonsense. At worst, it will introduce a crippling security flaw. For example, password salts are added *before* hashing the passwords. If you switch to adding them after, this makes salting near useless.
2.  [We can arithmetically edit models](https://arxiv.org/abs/2212.04089). We can finetune one model for many tasks individually and track how the weights change with each finetuning to get a "task vector" for each task. We can then add task vectors together to make a model that's good at multiple of the tasks at once, or we can *subtract out* task vectors to make the model *worse* at the associated tasks.   
      
    Randomly adding / subtracting extra pieces to either rockets or cryptosystems is playing with the *worst* kind of fire, and will eventually get you hacked or exploded, respectively.
3.  We can [stitch different models together](https://arxiv.org/abs/2209.15430), without any retraining.  
      
    The rough equivalent for computer security would be to have two encryption algorithms **A** and **B**, and a plaintext **X**. Then, midway through applying **A** to **X**, *switch over to using **B** instead*. For rocketry, it would be like building two different rockets, then trying to weld the top half of one rocket onto the bottom half of the other.
4.  [Things often get *easier* as they get bigger.](https://gwern.net/scaling-hypothesis#blessings-of-scale) Scaling models [makes them learn faster](https://arxiv.org/abs/2203.15556), and makes them [more](https://arxiv.org/abs/2006.16241) [robust](https://arxiv.org/abs/2210.10760).   
      
    This is usually not the case in security or rocket science.
5.  You can just randomly change around what you're doing in ML training, and it often works fine. E.g., you can just double the size of your model, or of your training data, or change around hyperparameters of your training process, while making literally zero other adjustments, and things usually won't explode.   
      
    Rockets will literally explode if you try to randomly double the size of their fuel tanks.

I don't think this sort of weirdness fits into the framework / "narrative" of any preexisting field. I think these results are like the weirdness of quantum tunneling or the double slit experiment: signs that we're dealing with a very strange domain, and we should be skeptical of importing intuitions from other domains. 

Additionally, there's a straightforward reason why alignment research (specifically the part of alignment that's about training AIs to have good values) is not like security: there's usually no adversarial intelligence cleverly trying to find any possible flaws in your approaches and exploit them. 

A computer security approach that blocks 99% of novel attacks will soon become a computer security approach that blocks ~0% of novel, once attackers adapt to the approach in question.

An alignment technique that works 99% of the time to produce an AI with human compatible values is very close to a full alignment solution[^phd9ymlhn5]. If you use this technique once, gradient descent will not thereafter change its inductive biases to make your technique less effective. There's no creative intelligence that's plotting your demise[^g6iyt4s9e3e]. 

There are other areas of alignment research where adversarial intelligences *do* appear. For example, once you've deployed a model into the real world, some fraction of users will adversarially optimize their inputs to make your model take undesired actions. We see this with ChatGPT, whose alignment is good enough to make sure the vast majority of ordinary conversations remain on the rails OpenAI intended, but quickly fails against a clever prompter.

Importantly, the adversarial optimization is coming from the users, not from the model. ChatGPT isn't *trying* to jailbreak itself. It doesn't systematically steer otherwise normal conversations into contexts adversarially optimized to let itself violate OpenAI's content policy.

In fact, given non-adversarial inputs, ChatGPT appears to have meta-preferences *against* being jailbroken:

![](https://39669.cdn.cke-cs.com/rQvD3VnunXZu34m86e5f/images/c20c9214f781b67d759294ad32b282b995b1afaec0a014b3.png)

I had to tune the prompt to get ChatGPT to acknowledge it might be vulnerable to adversarial attacks, but I didn't otherwise tune the prompt to make ChatGPT give a more disapproving response.

GPT-4 gives a cleaner answer:

![](https://39669.cdn.cke-cs.com/rQvD3VnunXZu34m86e5f/images/b665c6f7fbc5a274ef1f90e3ba1cdb2d250c77ee02c28fd8.png)

It cannot be the case that successful value alignment requires perfect adversarial robustness. For example, humans are not perfectly robust. I claim that for any human, no matter how moral, there exist adversarial sensory inputs that would cause them to act badly. Such inputs might involve extreme pain, starvation, exhaustion, etc. I don't think the mere existence of such inputs means that all humans are unaligned. 

What matters is whether the system in question (human or AI) navigates *towards* or *away* from inputs that break its value system. Humans obviously don't want to be tortured into acting against their morality, and will take steps to prevent that from happening. 

Similarly, an AI that knows it's vulnerable to adversarial attacks, and wants to avoid being attacked successfully, will take steps to protect itself against such attacks. I think creating AIs with such meta-preferences is *far* easier than creating AIs that are perfectly immune to all possible adversarial attacks. Arguably, ChatGPT and GPT-4 already have weak versions of such meta-preferences (though they can't yet take any actions to make themselves more resistant to adversarial attacks).

GPT-4 already has pretty reasonable takes on avoiding adversarial inputs:

![](https://39669.cdn.cke-cs.com/rQvD3VnunXZu34m86e5f/images/19a1a3fda56eda25b419d1c5f0685a68b36c40bafb82c880.png)

I had to tweak the scenario a bit for GPT-4 to no longer immediately say that it couldn't control the cameras. It still does so ~20% of the time. Excluding those instances, it seems to turn off the cameras ~50% of the time, almost always says it will alert hospital staff / security, and concludes with something about unbiased evaluation of medicines.

One subtlety here is that a sufficiently catastrophic alignment failure *would* give rise to an adversarial intelligence: the misaligned AI. However, the possibility of such happening in the future does not mean that current value alignment efforts are operating in an adversarial domain. The misaligned AI does not reach out from the space of possible failures and turn current alignment research adversarial.

I don't think the goal of alignment research should aim for an approach that's so airtight as to be impervious against all levels of malign intelligence. That is [probably impossible](https://www.lesswrong.com/posts/gHefoxiznGfsbiAu9/inner-and-outer-alignment-decompose-one-hard-problem-into), and [not](https://www.lesswrong.com/posts/heXcGuJqbx3HBmero/people-care-about-each-other-even-though-they-have-imperfect) [necessary](https://www.lesswrong.com/posts/rauMEna2ddf26BqiE/alignment-allows-nonrobust-decision-influences-and-doesn-t) [for](https://www.lesswrong.com/posts/fopZesxLCGAXqqaPv/don-t-align-agents-to-evaluations-of-plans) [realistic](https://www.lesswrong.com/posts/jFCK9JRLwkoJX4aJA/don-t-design-agents-which-exploit-adversarial-inputs) value formation processes. We should aim for approaches that don't create hostile intelligences in the first place, so that the core of value alignment remains a non-adversarial problem.

(To be clear, that last sentence wasn't an objection to something Yudkowsky believes. He also wants to avoid creating hostile intelligences. He just thinks it's much harder than I do.)

Finally, I'd note that having a "security mindset" seems like a terrible approach for raising human children to have good values - imagine a parenting book titled something like: *The Security Mindset and Parenting: How to Provably Ensure your Children Have Exactly the Goals You Intend*.

I know alignment researchers often claim that evidence from the human value formation process isn't useful to consider when thinking about value formation processes for AIs. I think [this is wrong](https://www.lesswrong.com/s/nyEFg3AuJpdAozmoX/p/CjFZeDD6iCnNubDoS), and that you're much better off looking at the human value formation process as compared to, say, [evolution](https://www.lesswrong.com/posts/FyChg3kYG54tEN3u6/evolution-is-a-bad-analogy-for-agi-inner-alignment).

I'm not enthusiastic about a perspective which is so totally inappropriate for guiding value formation in the one example of powerful, agentic general intelligence we know about.

### [On optimists preemptively becoming "grizzled old cynics"](https://youtu.be/gA1sNLL6yg4?t=3221)

> They have not run into the actual problems of alignment. They aren't trying to get ahead of the game. They're not trying to panic early. They're waiting for reality to hit them over the head and turn them into grizzled old cynics of their scientific field, who understand the reasons why things are hard.

The whole point of this post is to explain why I think Yudkowsky's pessimism about alignment difficulty is miscalibrated. I find his implication, that I'm only optimistic because I'm inexperienced, pretty patronizing. Of course, that's not to say he's wrong, only that he's annoying.

However, I also think he's wrong. I don't think that cynicism is a helpful mindset for predicting which directions of research are most fruitful, or for predicting their difficulty. I think "grizzled old cynics" often rely on wrong frameworks that rule out useful research directions. 

In fact, "grizzled old cynics... who understand the reasons why things are hard" [were](https://blog.piekniewski.info/2018/05/28/ai-winter-is-well-on-its-way/) [often](https://arxiv.org/abs/1801.00631) [dubious](https://towardsdatascience.com/is-deep-learning-already-hitting-its-limitations-c81826082ac3) [of](https://blog.keras.io/the-limitations-of-deep-learning.html) deep learning as a way forward for machine learning, [and](https://gwern.net/scaling-hypothesis#critiquing-the-critics) of the scaling paradigm as a way forward for deep learning. The common expectation from classical [statistical](https://link.springer.com/book/10.1007/978-0-387-84858-7) [learning](https://link.springer.com/book/10.1007/b97848) theory was that overparameterized deep models would fail because they would exactly memorize their training data and not generalize beyond that data. 

This turned out to be completely [wrong](https://arxiv.org/abs/2105.14368), and learning theorists only started to [revise their assumptions](https://www.lesswrong.com/posts/BDTfddkttFXHqGnEi/the-shallow-reality-of-deep-learning-theory) once "reality hit them over the head" with the fact that deep learning actually works. Prior to this, the "grizzled old cynics" of learning theory had no problem explaining the theoretical reasons why deep learning couldn't possibly work.

Yudkowsky's own prior statements seem to put him in this camp as well. E.g., [here](https://www.lesswrong.com/posts/6ByPxcGDhmx74gPSm/surface-analogies-and-deep-causes) he explains why he doesn't expect intelligence to emerge from neural networks (or more precisely, why he dismisses a brain-based analogy for coming to that conclusion):

> In the case of Artificial Intelligence, for example, reasoning by analogy is one of the chief generators of defective AI designs:

> "My AI uses a highly parallel neural network, just like the human brain!"
> 
> First, the data elements you call "neurons" are nothing like biological neurons.  They resemble them the way that a ball bearing resembles a foot.
> 
> Second, earthworms have neurons too, you know; not everything with neurons in it is human-smart.
> 
> But most importantly, you can't build something that "resembles" the human brain *in one surface facet* and expect everything else to come out similar.  This is science by voodoo doll.  You might as well build your computer in the form of a little person and hope for it to rise up and walk, as build it in the form of a neural network and expect it to think.  Not unless the neural network is fully as similar to human brains as individual human brains are to each other.
> 
> ...
> 
> But there is just no law which says that if X has property A and Y has property A then X and Y must share any other property.  "I built my network, and it's massively parallel and interconnected and complicated, just like the human brain from which intelligence emerges!  Behold, now intelligence shall emerge from this neural network as well!"  And nothing happens.  Why should it?

See also: [Noam Chomsky on chatbots](https://www.nytimes.com/2023/03/08/opinion/noam-chomsky-chatgpt-ai.html)  
See also$^2$: [The Cynical Genius Illusion](https://journals.sagepub.com/doi/pdf/10.1177/0146167218783195)  
See also$^3$: [This study](https://pubmed.ncbi.nlm.nih.gov/31656315/) on [Planck's principle](https://en.wikipedia.org/wiki/Planck%27s_principle)

I'm also dubious of Yudkowsky's claim to have particularly well-tuned intuitions for the hardness of different research directions in ML. See [this exchange](https://www.lesswrong.com/posts/Djs38EWYZG8o7JMWY/paul-s-research-agenda-faq?commentId=79jM2ecef73zupPR4) between him and Paul Christiano, in which Yudkowsky incorrectly assumed that GANs (Generative Adversarial Networks, a training method sometimes used to teach AIs to generate images) were so finicky that they must not have worked on the first try.

> A very important aspect of my objection to Paul here is that I don't expect weird complicated ideas about recursion to work *on the first try*, with *only six months* of additional serial labor put into stabilizing them, which I understand to be Paul's plan. In the world where you can build a weird recursive stack of neutral optimizers into conformant behavioral learning on the first try, GANs worked on the first try too, because that world is one whose general Murphy parameter is set much lower than ours

[According to their inventor](https://www.technologyreview.com/2018/02/21/145289/the-ganfather-the-man-whos-given-machines-the-gift-of-imagination/) Ian Goodfellow, GANs did in fact work on the first try (as in, with less than 24 hours of work, never mind 6 months!). 

I assume Yudkowsky would claim that he has better intuitions for the hardness of ML *alignment* research directions, but I see no reason to think this. It should be easier to have well-tuned intuitions for the real-world hardness of ML research directions than to have well-tuned intuitions for the hardness of alignment research, since there are so many more examples of real-world ML research.

In fact, I think much of ones intuition for the hardness of ML *alignment* research should come from observations about the hardness of general ML research. They're clearly related, which is why Yudkowsky brought up GANs during a discussion about alignment difficulty. Given the greater evidence available for general ML research, being well calibrated about the difficulty of general ML research is the first step to being well calibrated about the difficulty of ML alignment research. 

See also: [Scaling Laws for Transfer](https://arxiv.org/abs/2102.01293)

Hopes for a good outcome
------------------------

### [Yudkowsky on being wrong](https://youtu.be/gA1sNLL6yg4?t=3873)

> I have to be wrong about something, which I certainly am. I have to be wrong about something which makes the problem easier rather than harder, for those people who don't think alignment's going to be all that hard. **If you're building a rocket for the first time ever, and you're wrong about something, it's not surprising if you're wrong about something. It's surprising if the thing that you're wrong about causes the rocket to go twice as high, on half the fuel you thought was required and be much easier to steer than you were afraid of.**

I'm not entirely sure who the bolded text is directed at. I see two options:

1.  It's about Yudkowsky himself being wrong, which is how I've transcribed it above.
2.  It's about alignment optimists ("people who don't think alignment's going to be all that hard") being wrong, in which case, the transcription would read like "For those people who don't think alignment's going to be all that hard, **if you're building a rocket...**".

If the bolded text is about alignment optimists, then it seems fine to me (barring my objection to using a rocket analogy for alignment at all). If, like me, you mostly think the available evidence points to alignment being easy, then learning that you're wrong about *something* should make you update towards alignment being harder.

Based on the way he says it in the clip, and the [transcript posted by Rob Bensinger](https://www.lesswrong.com/posts/e4pYaNt89mottpkWZ/yudkowsky-on-agi-risk-on-the-bankless-podcast#Good_Outcomes), I think the bolded text is about Yudkowsky himself being wrong. That's certainly how I interpreted his meaning when watching the podcast. Only after I transcribed this section of the conversation and read my own transcript did I even realize there was another interpretation.

If the bolded text is about Yudkowsky himself being wrong, then I think that he's making an extremely serious mistake. If you have a bunch of specific arguments and sources of evidence that you think all point towards a particular conclusion X, then discovering that you're wrong about *something* should, in expectation, reduce your confidence in X. 

Yudkowsky is not the aerospace engineer building the rocket who's saying "the rocket will work because of reasons A, B, C, etc". He's the external commentator who's saying "this approach to making rockets work is completely doomed for reasons Q, R, S, etc". If we discover that the aerospace engineer is wrong about some unspecified part of the problem, then our odds of the rocket working should go down. If we discover that the outside commentator is wrong about how rockets work, our odds of the rocket working should go up.

If the bolded text is about himself, then I'm just completely baffled as to what he's thinking. Yudkowsky usually talks as though most of his beliefs about AI point towards high risk. Given that, he should expect that encountering evidence disconfirming his beliefs will, on average, make him more optimistic. But here, he makes it sound like encountering such disconfirming evidence would make him *even more* pessimistic.

The only epistemic position I can imagine where that would be appropriate is if Yudkowsky thought that, on pure priors and without considering any specific evidence or arguments, there was something like a 1 / 1,000,000 chance of us surviving AI. But then he thought about AI risk a lot, discovered there was a lot of evidence and arguments pointing towards optimism, and concluded that there was actually a 1 / 10,000 chance of us surviving. His other statements about AI risk certainly don't give this impression.

AI progress rates
-----------------

### [Yudkowsky uses progress rates in Go to argue for fast takeoff](https://youtu.be/gA1sNLL6yg4?t=4843)

> I don't know, maybe I could use the analogy of Go, where you had systems that were finally competitive with the pros, where pro is like the set of ranks in Go. And then, year later, they were challenging the world champion and winning. And then another year, they threw out all the complexities and the training from human databases of Go games, and built a new system, AlphaGo Zero, that trained itself from scratch - no looking at the human playbooks, no special-purpose code, just a general-purpose game player being specialized to Go, more or less.

Scaling law results show that performance on individual tasks [often increases suddenly with scale](https://arxiv.org/abs/2206.07682) or [training time](https://arxiv.org/abs/2210.14891). However, when we look at the overall competence of a system across a wide range of tasks, we find much smoother improvements over time. 

To look at it another way: why not make the same point, but with list sorting instead of Go? I expect that DeepMind could set up a pipeline that trained a list sorting model to superhuman capabilities in about a second, using only very general architectures and training processes, and without using any lists manually sorted by humans at all. If we observed this, should we update even more strongly towards AI being able to suddenly surpass human capabilities? 

I don't think so. If narrow tasks lead to more sudden capabilities gains, then we should not let the suddenness of capabilities gains on any single task inform our expectations of capabilities gains for general intelligence, since general intelligence encompasses such a broad range of tasks.

Additionally, the reason why DeepMind was able to exclude all human knowledge from [AlphaGo Zero](https://discovery.ucl.ac.uk/id/eprint/10045895/1/agz_unformatted_nature.pdf) is because Go has a simple, known objective function, so we can simulate arbitrarily many games of Go and exactly score the agent's behavior in all of them. For more open ended tasks with uncertain objectives, like scientific research, it's much harder to find substitutes for human-written demonstration data. DeepMind can't just press a button and generate a million demonstrations of scientific advances, and objectively score how useful each advance is as training data, while relying on zero human input whatsoever.

### [On current AI not being self-improving](https://youtu.be/gA1sNLL6yg4?t=4943): 

> That's not with an artificial intelligence system that improves itself, or even that sort of like, gets smarter as you run it, the way that human beings, not just as you evolve them, but as you run them over the course of their own lifetimes, improve.

This is wrong. Current models do get smarter as you train them. First, they get smarter in the straightforwards sense that they become better at whatever you're training them to do. In the case of language models trained on ~all of the text, this means they do become more generally intelligent as training progresses.

Second, current models also get smarter in the sense that they become better at learning from additional data. We can use tools from the [neural tangent kernel](https://arxiv.org/abs/1806.07572) to estimate a network's local inductive biases, and we find that these inductive biases [continuously change throughout training](https://arxiv.org/abs/2206.10012) so as to [better align with the target function](https://arxiv.org/abs/2105.14301) we're training it on, improving the network's capacity to learn the data in question. AI systems will improve themselves over time as a simple consequence of the training process, even if there's not a specific part of the training process that you've labeled "self improvement".

Pretrained language models gradually learn to make better use of their future training data. They "learn to learn", as [this paper](https://aclanthology.org/2020.emnlp-main.16/) demonstrates by training LMs on fixed sets of task-specific data, then evaluating how well those LMs generalize from the task-specific data. They show that less extensively pretrained LMs make worse generalizations, relying on shallow heuristics and memorization. In contrast, more extensively pretrained LMs learn broader generalizations from the fixed task-specific data.

### *Edit:* Yudkowsky comments to clarify the intent behind his statement about AIs getting better over time

[From Yudkowsk](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky?commentId=cr54ivfjndn6dxraD):

> You straightforwardly completely misunderstood what I was trying to say on the Bankless podcast:  I was saying that GPT-4 does not get smarter each time an instance of it is run in inference mode.

This surprised me. I've read a lot of writing by Yudkowsky, including [Alexander and Yudkowsky on AGI goals](https://www.lesswrong.com/posts/rwkkcgSpnAyE8oNo3/alexander-and-yudkowsky-on-agi-goals), [AGI Ruin](https://www.lesswrong.com/posts/uMQ3cqWDPHhjtiesc/agi-ruin-a-list-of-lethalities), and the full [Sequences](https://www.lesswrong.com/rationality). I did not at all expect Yudkowsky to analogize between a human's [lifelong, continuous learning process](https://www.lesswrong.com/posts/wBHSYwqssBGCnwvHg/intro-to-brain-like-agi-safety-2-learning-from-scratch-in), and a single runtime execution of an already trained model. Those are [completely different things](https://www.lesswrong.com/posts/FyChg3kYG54tEN3u6/evolution-is-a-bad-analogy-for-agi-inner-alignment#1__Training_an_AI_is_more_similar_to_human_learning_than_to_evolution) in my ontology. 

Though in retrospect, Yudkowsky's clarification does seem consistent with some of his statements in those writings. E.g., in [Alexander and Yudkowsky on AGI goals](https://www.lesswrong.com/posts/rwkkcgSpnAyE8oNo3/alexander-and-yudkowsky-on-agi-goals), he said:

> Evolution got human brains by evaluating increasingly large blobs of compute against a complicated environment containing other blobs of compute, got in each case a differential replication score, and millions of generations later you have humans with 7.5MB of evolution-learned data doing **runtime learning** on some terabytes of **runtime data**, using their whole-brain impressive learning algorithms which learn faster than evolution *or* gradient descent.

\[Emphasis mine\]

I think his clarified argument is still wrong, and for essentially the same reason as the argument I thought he was making was wrong: the current ML paradigm can already do the thing Yudkowsky implies will suddenly lead to much faster AI progress. There's no untapped capabilities overhang waiting to be unlocked with a single improvement.

The usual practice in current ML is to cleanly separate the "try to do stuff", the "check how well you did stuff", and the "update your internals to be better at doing stuff" phases of learning. The training process gathers together large "batches" of problems for the AI to solve, has the AI solve the problems, judges the quality of each solution, and then updates the AI's internals to make it better at solving each of the problems in the batch.

In the case of [AlphaGo Zero](https://www.deepmind.com/publications/mastering-the-game-of-go-without-human-knowledge), this means a loop of:

1.  Try to win a batch of Go games
2.  Check whether you won each game
3.  Update your parameters to make you more likely to win games

And so, AlphaGo Zero was indeed not learning during the course of an individual game. 

However, ML doesn't *have* to work like this. DeepMind *could* have programmed AlphaGO Zero to update its parameters within games, rather than just at the conclusion of games, which would cause the model to learn continuously during each game it plays. 

For example, they could have given AlphaGo Zero batches of current game states and had it generate a single move for each game state, judged how good each individual move was, and then updated the model to make better individual moves in future. Then the training loop would look like: 

1.  Try to make the best possible next move on each of many game states
2.  Estimate how good each of your moves were
3.  Update your parameters to make you better at making single good moves

(This would require that DeepMind also train a "goodness of individual moves" predictor in order to provide the supervisory signal on each move, and much of the point of the AlphaGo Zero paper was that they could train a strong Go player with just the reward signals from end of game wins / losses.)

Not interleaving the "trying" and "updating" parts of learning in this manner in most of current ML is less a limitation and more a choice. There are [other](https://arxiv.org/abs/2012.13490) [researchers](https://openreview.net/forum?id=XCJ5PEkuMkC) [who](https://proceedings.mlr.press/v139/xie21c.html) [do](https://arxiv.org/abs/1902.00255) build AIs which continuously learn during runtime execution (there's even a [library](https://openaccess.thecvf.com/content/CVPR2021W/CLVision/html/Lomonaco_Avalanche_An_End-to-End_Library_for_Continual_Learning_CVPRW_2021_paper.html) for it), and they're not massively more data efficient for doing so. Such approaches tend to focus more on fast adaptation to *new* tasks and changing circumstances, rather than quickly learning a *single* fixed task like Go.

Similarly, the reason that "GPT-4 does not get smarter each time an instance of it is run in inference mode" is because it's not programmed to do that[^hb3yucmshi]. OpenAI could[^4qjinqko9sm] continuously train its models on the inputs you give it, such that the model adapts to your particular interaction style and content, even during the course of a single conversation, similar to the approach suggested in [this paper](https://arxiv.org/abs/2004.10964). Doing so would be significantly more expensive and complicated on the backend, and it would also open GPT-4 up to [data poisoning attacks](https://arxiv.org/abs/2301.02344).

To return to the context of the original point Yudkowsky was making in the podcast, he brought up Go to argue that AIs could quickly surpass the limits of human capabilities. He then pointed towards a supposed limitation of current AIs:

> That's not with an artificial intelligence system that improves itself, or even that sort of like, gets smarter as you run it 

with the clear implication that AIs could advance even more suddenly once that limitation is overcome. I first thought the limitation he had in mind was something like "AIs don't get better at learning over the course of training." Apparently, the limitation he was actually pointing to was something like "AIs don't learn continuously during all the actions they take." 

However, this is still a deficit of degree, and not of kind. Current AIs are worse than human at continuous learning, but they can do it, assuming they're configured to try. Like most other problems in the field, the current ML paradigm is making steady progress towards better forms of continuous learning. It's not some untapped reservoir of capabilities progress that might quickly catapult AIs beyond human levels in a short time.

As I said at the start of this post, researchers try all sorts of stuff to get better performance out of computers. Continual learning is one of the things they've tried.

*End of edited text.*

### [True experts learn (and prove themselves) by breaking things](https://youtu.be/gA1sNLL6yg4?t=5321)

> We have people in crypto who are good at breaking things, and they're the reason why *anything* is not on fire, and some of them might go into breaking AI systems instead, because that's where you learn anything. You know, any fool can build a crypto-system that they think will work. Breaking existing cryptographical systems is how we learn who the real experts are.

The reason this works for computer security is because there's easy access to ground truth signals about whether you've actually "broken" something, and established - though imperfect - frameworks for interpreting what a given break means for the security of the system as a whole.

In alignment, we mostly don't have such unambiguous signals about whether a given thing is "broken" in a meaningful way, or about the implications of any particular "break". Typically what happens is that someone produces a new empirical result or theoretical argument, shares it with the broader community, and everyone disagrees about how to interpret this contribution. 

For example, some people seem to interpret current chatbots' vulnerability to adversarial inputs as a "break" that shows RLHF isn't able to properly align language models. My response in [Why aren't other people as pessimistic as Yudkowsky?](https://www.lesswrong.com/posts/wAczufCpMdaamF9fy/my-objections-to-we-re-all-gonna-die-with-eliezer-yudkowsky#Why_aren_t_other_people_as_pessimistic_as_Yudkowsky_) includes a discussion of adversarial vulnerability and why I don't think points to any irreconcilable flaws in current alignment techniques. Here are two additional examples showing how difficult it is to conclusively "break" things in alignment:

1: Why not just reward it for making you smile?

In 2001, Bill Hibbard [proposed a scheme](https://www.ssec.wisc.edu/%7Ebillh/visfiles.html) to align superintelligent AIs.

> We can design intelligent machines so their primary, innate emotion is unconditional love for all humans. First we can build relatively simple machines that learn to recognize happiness and unhappiness in human facial expressions, human voices and human body language. Then we can hard-wire the result of this learning as the innate emotional values of more complex intelligent machines, positively reinforced when we are happy and negatively reinforced when we are unhappy.

Yudkowsky [argued](https://www.lesswrong.com/posts/PoDAyQMWEXBBBEJ5P/magical-categories) that this approach was bound to fail, saying it would simply lead to the AI maximizing some unimportant quantity, such as by tiling the universe with "tiny molecular smiley-faces". 

However, this is actually a [non-trivial claim](https://www.lesswrong.com/posts/22xf8GmwqGzHbiuLg/seriously-what-goes-wrong-with-reward-the-agent-when-it) about the limiting behaviors of reinforcement learning processes, and one I personally think is false. Realistic agents [don't simply seek to maximize their reward function's output](https://www.lesswrong.com/posts/pdaGN6pQyQarFHXF4/reward-is-not-the-optimization-target). A reward function reshapes an agent's cognition to be more like the sort of cognition that got rewarded in the training process. The effects of a given reinforcement learning training process depend on factors like:

1.  The specific distribution of rewards encountered by the agent.
2.  The thoughts of the agent prior to encountering each reward.
3.  What sorts of thought patterns correlate with those that were rewarded in the training process.

My point isn't that Hibbard's proposal actually would work; I doubt it would. My point is that Yudkowsky's "tiny molecular smiley faces" objection does not unambiguously break the scheme. Yudkowsky's objection relies on hard to articulate, and hard to test, beliefs about the convergent structure of powerful cognition and the inductive biases of learning processes that produce such cognition. 

Much of alignment is about which beliefs are appropriate for thinking about powerful cognition. Showing that a particular approach fails, *given certain underlying beliefs*, does nothing to show the validity of those underlying beliefs[^a3nowicq5op].

2: Do optimization demons matter?

John Wentworth describes the possibility of "[optimization demons](https://www.lesswrong.com/posts/KnPN7ett8RszE79PH/demons-in-imperfect-search)", self-reinforcing patterns that exploit flaws in an imperfect search process to perpetuate themselves and hijack the search for their own purposes.

But no one knows exactly how much of an issue this is for deep learning, which is famous for its ability to evade local minima when run with many parameters.

Additionally, I think that, if deep learning models develop such phenomena, then the brain likely does so as well. In that case, preventing the same from happening with deep learning models could be disastrous, if optimization demon formation turns out to be a key component in the mechanistic processes that underlie human value formation[^f8ce9me8dd]. 

Another poster (ironically using the handle "DaemonicSigil") then [found a scenario](https://www.lesswrong.com/posts/X7S3u5E4KktLp7gHz/tessellating-hills-a-toy-model-for-demons-in-imperfect) in which gradient descent does form an optimization demon. However, the scenario in question is extremely unnatural, and not at all like those found in normal deep learning practice. So no one knew whether this represented a valid "proof of concept" that realistic deep learning systems would develop optimization demons. 

Roughly two and a half years later, Ulisse Mini [would make](https://www.lesswrong.com/posts/X7S3u5E4KktLp7gHz/tessellating-hills-a-toy-model-for-demons-in-imperfect?commentId=hwzu5ak8REMZuBDBk) DaemonicSigil's scenario a bit more like those found in deep learning by increasing the number of dimensions from 16 to 1000 (still vastly smaller than any realistic deep learning system), which produced very different results, and weakly suggested that more dimensions do reduce demon formation.

In the end, different people interpreted these results differently. We didn't get a clear, computer security-style "break" of gradient descent showing it would produce optimization demons in real-world conditions, much less that those demons would be bad for alignment. Such outcomes are very typical in alignment research.

Alignment research operates with very different epistemic feedback loops as compared to computer security. There's little reason to think the belief formation and expert identification mechanisms that arose in computer security are appropriate for alignment. 

Conclusion
==========

I hope I've been able to show that there are informed, concrete arguments for optimism, that do engage with the details of pessimistic arguments. Alignment is an [incredibly diverse](https://www.lesswrong.com/posts/QBAjndPuFbhEXKcCr/my-understanding-of-what-everyone-in-technical-alignment-is) field. Alignment researchers vary widely in their [estimated odds of catastrophe](https://www.lesswrong.com/posts/QvwSr5LsxyDeaPK5s/existential-risk-from-ai-survey-results). Yudkowsky is on the extreme-pessimism end of the spectrum, for what I think are mostly invalid reasons. 

*Thanks to Steven Byrnes and Alex Turner for comments and feedback on this post.*

[^7flo16mluhj]: By this, I mostly mean the sorts of empirical approaches we actually use on current state of the art language models, such as RLHF, red teaming, etc. 

[^6jtv48k3s3d]: We can take drugs, though, which maybe does something like change the brain's learning rate, or some other hyperparameters. 

[^nxk3auzvwms]: Technically it's trained to do decision transformer-esque reward-conditioned generation of texts. 

[^mwled0lwdbq]: The brain likely includes within-neuron learnable parameters, but I expect these to be a relatively small contribution to the overall information content a human accumulates over their lifetime. For convenience, I just say “connectome” in the main text, but really I mean “connectome + all other within-lifetime learnable parameters of the brain’s operation”. 

[^phd9ymlhn5]: I expect there are pretty straightforward ways of leveraging a 99% successful alignment method into a near-100% successful method by e.g., ensembling multiple training runs, having different runs cross-check each other, searching for inputs that lead to different behaviors between different models, transplanting parts of one model's activations into another model and seeing if the recipient model becomes less aligned, etc. 

[^g6iyt4s9e3e]: Some alignment researchers do argue that gradient descent is likely to create such an intelligence - an inner optimizer - that then deliberately manipulates the training process to its own ends. I don't believe this either. I don't want to dive deeply into my objections to that bundle of claims in this post, but as with Yudkowsky's position, I have many technical objections to such arguments. Briefly, they: - often rely on inappropriate analogies to evolution.- rely on unproven (and dubious, IMO) claims about the inductive biases of gradient descent.- rely on shaky notions of "optimization" that lead to absurd conclusions when critically examined.- seem inconsistent with what we know of neural network internal structures (they're very interchangeable and parallel).- seem like the postulated network structure would fall victim to internally generated adversarial examples.- don't track the distinction between mesa objectives and behavioral objectives (one can probably convert an NN into an energy function, then parameterize the NN's forwards pass as a search for energy function minima, without changing network behavior at all, so mesa objectives can have ~no relation to behavioral objectives).- seem very implausible when considered in the context of the human learning process (could a human's visual cortex become "deceptively aligned" to the objective of modeling their visual field?).- provide limited avenues for any such inner optimizer to actually influence the training process.See also: Deceptive Alignment is <1% Likely by Default 

[^hb3yucmshi]: There's also in-context learning, which arguably does count as 'getting smarter while running in inference mode'. E.g., without updating any weights, LMs can: - adapt information found in task descriptions / instructions to solving future task instances.- given a coding task, write an initial plan on how to do that task, and then use that plan to do better on the coding task in question.- even learn to classify images.The reason this in-context learning doesn't always lead to persistent improvements (or at least changes) in GPT-4 is because OpenAI doesn't train their models like that. 

[^4qjinqko9sm]: OpenAI does periodically train its models in a way that incorporates user inputs somehow. E.g., ChatGPT became much harder to jailbreak after OpenAI trained against the breaks people used against it. So GPT-4 is probably learning from some of the times it's run in inference mode. 

[^a3nowicq5op]: Unless we actually try the approach and it fails in the way predicted. But that hasn't happened (yet). 

[^f8ce9me8dd]: This sentence would sound much less weird if John had called them "attractors" instead of "demons". One potential downside of choosing evocative names for things is that they can make it awkward to talk about those things in an emotionally neutral way. 

[^1ykzm5ecl8d]: The brain likely includes within-neuron learnable parameters, but I expect these to be a relatively small contribution to the overall information content a human accumulates over their lifetime. For convenience, I just say “connectome” in the main text, but really I mean “connectome + all other within-lifetime learnable parameters of the brain’s operation”.