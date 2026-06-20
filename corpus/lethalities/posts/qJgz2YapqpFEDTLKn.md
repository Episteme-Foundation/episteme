We had some discussions of the [AGI ruin arguments](https://www.lesswrong.com/posts/uMQ3cqWDPHhjtiesc/agi-ruin-a-list-of-lethalities) within the DeepMind alignment team to clarify for ourselves which of these arguments we are most concerned about and what the implications are for our work. This post summarizes the opinions of a subset of the alignment team on these arguments. **Disclaimer**: these are our own opinions that do not represent the views of DeepMind as a whole or its broader community of safety researchers.

This doc shows opinions and comments from 8 people on the alignment team (without attribution). For each section of the list, we show a table summarizing agreement / disagreement with the arguments in that section (the tables can be found in this [sheet](https://docs.google.com/spreadsheets/d/e/2PACX-1vT4sNsGF75VdV-d6li33edmP-yM6I-RDyXKDYc-9PMVhyd_Bj8zPRdPaQqVuPlnDEqisP8HhDyhuVhG/pubhtml)). Each row is sorted from Agree to Disagree, so a column does not correspond to a specific person. We also provide detailed comments and clarifications on each argument from the team members. 

For each argument, we include a shorthand description in a few words for ease of reference, and a summary in 1-2 sentences (usually copied from the bolded parts of the original arguments). We apologize for some inevitable misrepresentation of the original arguments in these summaries. Note that some respondents looked at the original arguments while others looked at the summaries when providing their opinions (though everyone has read the original list at some point before providing opinions). 

A general problem when evaluating the arguments was that people often agreed with the argument as stated, but disagreed about the severity of its implications for AGI risk. A lot of these ended up as "mostly agree / unclear / mostly disagree" ratings. It would have been better to gather two separate scores (agreement with the statement and agreement with implications for risk).

Summary of agreements, disagreements and implications 
======================================================

**Most agreement**:

*   **Section A ("strategic challenges"):** #1 (human level is nothing special), #2 (unaligned superintelligence could easily take over), #8 (capabilities generalize out of desired scope)
*   **Section B1 (distributional leap):** #14 (some problems only occur in dangerous domains)
*   **Section B2 (outer/inner alignment):** #16 (inner misalignment), #18 (no ground truth), #23 (corrigibility is anti-natural)
*   **Section B3 (interpretability):** #28 (large option space)
*   **Section B4 (miscellaneous):** #36 (human flaws make containment difficult)

**Most disagreement**:

*   **#6 (pivotal act is necessary).** We think it's necessary to end the acute risk period, but don't agree with the "pivotal act" framing that assumes that the risk period is ended through a discrete unilateral action by a small number of actors. 
*   **#24 (sovereign vs corrigibility).** We think this kind of equivocation isn't actually happening much in the alignment community. Our work focuses on building corrigible systems (rather than sovereigns), and we expect that the difficulties of this approach could be surmountable, especially if we can figure out how to avoid building arbitrarily consequentialist systems. 
*   **#39 (can't train people in security mindset).** Most of us don't think it's necessary to generate all the arguments yourself in order to make progress on the problems. 
*   **#42 (there's no plan).** The kind of plan we imagine Eliezer to be thinking of does not seem necessary for a world to survive.

**Most controversial** among the team:

*   **Section A ("strategic challenges"):** #4 (can't cooperate to avoid AGI), #5 (narrow AI is insufficient), #7 (no weak pivotal acts), #9 (pivotal act is a dangerous regime)
*   **Section B1 (distributional leap):** #13 and 15 (problems above intelligence threshold and correlated capability gains)
*   **Section B2 (outer/inner alignment):** #17 (inner properties), #21 (capabilities go further), #22 (simple alignment core)
*   **Section B3 (interpretability):** #30 (powerful vs understandable), #32 (language is insufficient), #33 (alien concepts)
*   **Section B4 (miscellaneous):** #35 (multi-agent is single-agent)
*   **Section C ("civilizational inadequacy"):** #38 (lack of focus), #41 (have to write this list), #43 (unawareness of risks)

**Cruxes** from the most controversial arguments:

*   How powerful does a system / plan need to be to save the world?
*   Is global cooperation sufficiently difficult that AGI would need to deploy new powerful technology to make it work?
*   Will we know how capable our models are? 
*   Will capabilities increase smoothly?
*   Will systems acquire the capability to be useful for alignment / cooperation before or after the capability to perform advanced deception? 
*   Is consequentialism a powerful attractor? How hard will it be to avoid arbitrarily consequentialist systems?
*   What is the overhead for aligned vs not-aligned AGI? 

**Possible implications** for our work:

*   Work on cooperating to avoid unaligned AGI (compute governance, publication norms, demonstrations of misalignment, etc)
*   Investigate techniques for limiting unaligned consequentialism, e.g. process-based feedback, limiting situational awareness, limited domains
*   Work on improving capability monitoring and control
*   Empirically investigate to what extent selection for undetectability / against interpretability occurs in practice as systems become more capable
*   Continue and expand our work on mechanistic interpretability and process-based feedback

Section A: "strategic challenges" (#1-9)
========================================

Summary
-------

![](https://lh3.googleusercontent.com/ZSGeJdxHI4TGPq0tvhDCZ9EsN9_20wcY1afDFwNPPAh-XvcA1fW6BKb3ZMpJHSeGUCsPl8gYhwyOpFVUWHmA6f6o4apvyf2htOTYvL05yB5jdhiNfHm8jfbeRMJ8kAGfbaSg-QddY-hQ61SuGkYyf9zJMC6NbxW485FLqXld1i3RzPGy0P5x12k-Pfo)

Detailed comments
-----------------

**#1\. Human level is nothing special / data efficiency**  
**Summary:** AGI will not be upper-bounded by human ability or human learning speed (similarly to AlphaGo).  Things much smarter than human would be able to learn from less evidence than humans require.

*   Agree (though don't agree with the implication that it will be discontinuous)
*   Agree (strongly, and possibly a major source of disagreement with broader ML community)

**#2\. Unaligned superintelligence could easily take over**  
**Summary:** A cognitive system with sufficiently high cognitive powers, given any medium-bandwidth channel of causal influence, will not find it difficult to bootstrap to overpowering capabilities independent of human infrastructure. 

*   Agree (including using human institutions and infrastructure for its own ends)
*   Agree ("sufficiently high" is doing a lot of the work here)
*   Mostly agree - it depends a lot on what "medium-bandwidth" means, and also how carefully the system is being monitored (e.g. how we're training the system online). I think "text-only channel, advising actions of a lot of people who tend to defer to the system" seems like probably enough -> takeover if we're not being that careful. But I think I probably disagree with the mechanism of takeover intended by Yudkowsky here.

**#3\. Can't iterate on dangerous domains**  
**Summary:** At some point there will be a 'first critical try' at operating at a 'dangerous' level of intelligence, and on this 'first critical try', we need to get alignment right. 

*   (x2) Mostly agree (misleading, see [Paul's Disagreement #1](https://www.alignmentforum.org/posts/CoZhXrhpQxpy9xw9y/where-i-agree-and-disagree-with-eliezer#Disagreements)) 
*   Mostly agree. It's not clear that attempting alignment and failing will necessarily be as irrecoverable as unaligned operation, but does seem very likely. If "dangerous" just means failing implies extinction then this statement is a truism.
*   Mostly agree (though "get alignment right on the first critical try" may lean heavily on "throttle capability until we get alignment right")

**#4\. Can't cooperate to avoid AGI**  
**Summary:** The world can't just decide not to build AGI.

*   Unclear. I think this depends a lot on what exactly happens in the real world in the next decade or so, and we might be able to buy time.
*   Unclear. Agree that worldwide cooperation to avoid AGI would be very difficult, but cooperation between Western AI labs seems feasible and could potentially be sufficient to end the acute risk period or buy more time (especially under short timelines). 
*   Unclear. I agree it is very hard and unlikely, but extreme things can happen in global politics given sufficiently extreme circumstances, and cooperation can do much to shape the pace and direction of tech development. 
*   Mostly disagree (more on principle than via seeing a stable solution; agree that "just" deciding not to build AGI doesn't work, but culture around AI could be shifted somehow)

**#5\. Narrow AI is insufficient**  
**Summary:** We can't just build a very weak system.

*   Agree (assuming #4)
*   Agree (this doesn't end the risk period)
*   Disagree (can potentially use narrow AI to help humans cooperate)
*   (x2) Disagree (more on principle - we should work on how to solve xrisk using somewhat-narrow systems; to be clear, this a problem to be solved, rather than something we "just do")

**#6\. Pivotal act is necessary**  
**Summary:** We need to align the performance of some large task, a 'pivotal act' that prevents other people from building an unaligned AGI that destroys the world.

*   Mostly agree (but disagree connotationally, in that "act" sounds like a single fast move, while an understandable human-timescale strategy is probably enough)
*   Unclear (it is necessary to end to acute risk period but it can be done by humans rather than an AGI)
*   Unclear (dislike framing; seems tied up with ability to cooperate)
*   Disagree if a pivotal act is a "discrete, powerful, gameboard-flipping action" (as opposed to something that ends the acute risk period)
*   Disagree (strongly disagree with pivotal act. Briefly, pivotal acts seem like the wrong framing. 
    *   It seems like "get people to implement stronger restrictions" or "explain misalignment risks" or "come up with better regulation" or "differentially improve alignment" are all better applications of an AGI than "do a pivotal act". 
    *   The pivotal act frame seems to be "there will be a tiny group of people who will have responsibility for saving the world" but the reality seems to if anything be closer to the opposite: there will be a tiny group of people that wants to build a tremendously ambitious (and thus also dangerous) AGI, the vast majority of the world would be in support of \_not\_ building such an AGI (and instead building many more limited systems, which can still deliver large amounts of wealth and/or value), and some set of people representing the larger global population in getting people to not build/deploy said dangerous AGI. This is an extension of the view that "AIs should be a major influence on large sectors of society" is probably a fairly unpopular view today already.

**#7\. There are no weak pivotal acts because a pivotal act requires power**  
**Summary:** It takes a lot of power to do something to the current world that prevents any other AGI from coming into existence; nothing which can do that is passively safe in virtue of its weakness. 

*   Agree (if by pivotal act we mean "discrete, powerful, gameboard-flipping action")
*   Agree (if the bar is "prevent any other AGI from coming into existence")
*   Agree (with caveats about cooperation)
*   Disagree. This may have technical/engineering solutions that don't involve high general-purpose agency, or may not require deploying narrow AI at all.

**#8\. Capabilities generalize out of desired scope**  
**Summary:** The best and easiest-found-by-optimization algorithms for solving problems we want an AI to solve, readily generalize to problems we'd rather the AI not solve.

*   Agree (conditional on #5)

**#9\. A pivotal act is a dangerous regime**  
**Summary:** The builders of a safe system would need to operate their system in a regime where it has the capability to kill everybody or make itself even more dangerous, but has been successfully designed to not do that.

*   Agree (conditional on #5)
*   Agree (if by pivotal act we mean "discrete, powerful, gameboard-flipping action")
*   Mostly disagree (because of underlying pivotal act framing). But agree that ML systems will realistically be operating in dangerous regimes. I agree with "Running AGIs doing something pivotal are not passively safe". I’d go further and state that it's likely people will run AGIs doing non-pivotal acts which are nonetheless unsafe. However, I disagree with the (I believe implied) claim that "We should be running AGIs doing something pivotal" (under the author's notion of "pivotal").
*   Disagree (human cooperation or humans assisted by narrow AI could end the acute risk period without an AI system having dangerous capabilities)

Section B.1: The distributional leap (#10-15)
=============================================

Summary
-------

![](https://lh4.googleusercontent.com/EwpvDQFM33pTSwD85iIxVerwHMK0upeh7CtAFdX5NUujuIP-wMGf9cIGb_jptc_IOnG0jxE75-Acc1EtyZ1jKmY2IegmkYXn_UbukW0wHo3w8xup5Zv0Fktx1zYdRtLjJak3JRHlYW64XJAyNBZeGAP1Ocjk5GGicT0haFl3hAbN6xkkuQZg0CMjpJ0)

Detailed comments
-----------------

**#10\. Large distributional shift to dangerous domains**  
**Summary:** On anything like the standard ML paradigm, you would need to somehow generalize optimization-for-alignment you did in safe conditions, across a big distributional shift to dangerous conditions.

*   Disagree - why are we counting on OOD generalization here as opposed to optimizing for what we want on the dangerous distribution?

**#11\. Sim to real is hard**  
**Summary:** There's no known case where you can entrain a safe level of ability on a safe environment where you can cheaply do millions of runs, and deploy that capability to save the world.

*   Agree (seems like an instance of #7)
*   Unclear. Agree that for many important tasks we aren't going to train in safe environments with millions of runs, and in particular not simulated environments, but disagree with underlying pivotal act frame
*   Mostly disagree (debate with interpretability could achieve this if it succeeds)

**#12\. High intelligence is a large shift**  
**Summary:** Operating at a highly intelligent level is a drastic shift in distribution from operating at a less intelligent level.

*   Mostly disagree (this relies on the sharp left turn, which doesn't seem that likely to me)

**#13\. Some problems only occur above an intelligence threshold**  
**Summary:** Many alignment problems of superintelligence will not naturally appear at pre-dangerous, passively-safe levels of capability. 

*   Mostly agree - I think many alignment problems will appear before, and also many won't appear until later (or at least, differences-in-degree will become differences-in-kind)
*   Not sure (agree some problems would \*naturally\* first arise for higher intelligence levels, but we can seek out examples for less intelligent systems, e.g. reward tampering & goal misgeneralization examples)
*   Mostly disagree (we'll get demos of problems; Eliezer seems to think this will be hard / unlikely to help though doesn't say that outright, if so I disagree with that)

**#14\. Some problems only occur in dangerous domains**  
**Summary:** Some problems seem like their natural order of appearance could be that they first appear only in fully dangerous domains.

*   Mostly agree (misleadingly true: we can create analogous examples before the first critical try)
*   Mostly agree (but that doesn't mean we can't usefully study them in safe domains)

**#15\. Capability gains from intelligence are correlated**  
**Summary:** Fast capability gains seem likely, and may break lots of previous alignment-required invariants simultaneously. 

*   Agree (in particular, once we have ~human-level AI, both AI development and the world at-large probably get very crazy very fast)
*   Mostly agree (this is my guess about the nature of intelligence, but I'm not sure I'm right)
*   Mostly agree, fast need not imply discontinuous
*   Unclear (disagree on fast capability gains being likely, agree on breaking invariants given fast gains)

Section B.2: Central difficulties of outer and inner alignment (#16-24)
=======================================================================

Summary
-------

![](https://lh3.googleusercontent.com/rAWGDMuhOsy5ot4RgMdHafNuNSRqO9A6Qxf-tEDNxPk8VQOJ2Wxq-M2ljCCTtFryxDMOK1iagpDGbLnZBdDZe7lRyMTFtqgnAdFoCFM6JJ6xB_mA2jzyz60vdlkpmO6Gfv6oNJZ76J33WH_81Lqk53AZSG9N2jao9VD9T9xJS4_Qlc44Kr27BmsUQ8k)

Detailed comments 
------------------

**#16\. Inner misalignment**  
**Summary:** Outer optimization even on a very exact, very simple loss function doesn't produce inner optimization in that direction.

*   Unclear - I strongly agree with the weaker claim that we don't get inner alignment for free, but the claim here seems more false than not? Certainly, outer optimization on most loss functions will lead to \_more\_ inner optimization in that direction (empirically and theoretically)

**#17\. Can't control inner properties**  
**Summary:** On the current optimization paradigm there is no general idea of how to get particular inner properties into a system, or verify that they're there, rather than just observable outer ones you can run a loss function over.

*   Agree (at least currently, the requisite interpretability capabilities and/or conceptual understanding of goal-directedness seems inadequate)
*   Mostly agree (though uncertain how much this is about the optimization paradigm and how much it's about interpretability)
*   Mostly agree (counter: current interpretability)
*   (x2) Mostly disagree (interpretability could address this) 

#18\. No ground truth (no comments)  
**Summary:** There's no reliable Cartesian-sensory ground truth (reliable loss-function-calculator) about whether an output is 'aligned'.

**#19\. Pointers problem**  
**Summary:** There is no known way to use the paradigm of loss functions, sensory inputs, and/or reward inputs, to optimize anything within a cognitive system to point at particular things within the environment.

*   Unclear - agreed that we have no principled way of doing this, but we also don't have great examples of this not working, so depends on how strongly this is intended. I don't think "high confidence that this won't work" is justified.
*   Agree (modulo the [shard theory objection](https://www.alignmentforum.org/posts/CoZhXrhpQxpy9xw9y/where-i-agree-and-disagree-with-eliezer?commentId=YJGedmBCPSrGmTmF4) to the strict reading of this)

**#20\. Flawed human feedback**  
**Summary:** Human raters make systematic errors - regular, compactly describable, predictable errors. 

*   Mostly agree (misleading, a major hope is to have your oversight process be smarter than the model, so that its systematic errors are not ones that the model can easily exploit)
*   Unclear (agree denotationally, unclear whether we can build enough self-correction on the most load-bearing parts of human feedback)

**#21\. Capabilities go further**  
**Summary:** Capabilities generalize further than alignment once capabilities start to generalize far.

*   Agree (seems similar to #8 and #15)
*   Mostly agree (by default; but I think there's hope in the observation that generalizing alignment is a surmountable problem for humans, so it might also be for AGI)

**#22\. No simple alignment core**  
**Summary:** There is a simple core of general intelligence but there is no analogous simple core of alignment.

*   Mostly agree (but something like "help this agent" seems like a fairly simple core)
*   Unclear (there may exist a system that has alignment as an attractor)

#23\. Corrigibility is anti-natural.  
**Summary:** Corrigibility is anti-natural to consequentialist reasoning.

*   Mostly agree (misleading, I agree with [Paul's comment](https://www.lesswrong.com/posts/AqsjZwxHNqH64C2b6/let-s-see-you-write-that-corrigibility-tag?commentId=8kPhqBc69HtmZj6XR) on "Let's see you write that corrigibility tag")
*   Mostly agree (I think we can avoid building arbitrarily consequentialist systems)
*   Agree with the statement that corrigibility is anti-natural to consequentialist reasoning. Yudkowsky's view seems to be that everything tends towards \*pure\* consequentialism, and I disagree with that.

**#24\. Sovereign vs corrigibility**  
**Summary:** There are two fundamentally different approaches you can potentially take to alignment \[a sovereign optimizing CEV or a corrigible agent\], which are unsolvable for two different sets of reasons. Therefore by ambiguating between the two approaches, you can confuse yourself about whether alignment is necessarily difficult.

*   Unclear. Agree in principle (but disagree this is happening that much)
*   Mostly disagree (agree these are two distinct approaches that should not be confused, disagree that people are confusing them or that they are unsolvable)
*   Mostly disagree - I agree that ambiguating between approaches is bad, but am not sure who/what that refers to, and there seems to be some implicit "all the approaches I've seen are non-viable" claim here, which I'd disagree with

Section B.3:  Central difficulties of sufficiently good and useful transparency / interpretability (#25-33)
===========================================================================================================

Summary
-------

![](https://lh6.googleusercontent.com/VasV7jbRtKEme6_gN4lOFZZz5qLwvoIxaTuIK3WJIfRGJgMvzMhQ_9AUXtfBIY0T9t8n9RSSuJVDvRQ1oqZpjB1CVyfd5l7WT88jQCrQYT8MfiT_lMP4cfunTV-7dCPieyUG1YuDRIWeYTo0E38pLXnlm5wR93PdqPcU_YHFbGmb7LwvH_w5l5sUewI)

Detailed comments
-----------------

**#25\. Real interpretability is out of reach**  
**Summary:** We've got no idea what's actually going on inside the giant inscrutable matrices and tensors of floating-point numbers. 

*   Agree - interpretability research has made impressive strides, and more than I expected in 2017, but is still a far shot from understanding most of what's happening inside the big mass of matmuls
*   Mostly agree (misleading, we plausibly do better in the future)
*   Mostly agree (we know a little now and not sure if we'll know more or less later)
*   Unclear (agree we don't have much idea right now, but I think we can develop better understanding, main uncertainty is whether we can do this in time)

**#26\. Interpretability is insufficient**  
**Summary:** Knowing that a medium-strength system of inscrutable matrices is planning to kill us, does not thereby let us build a high-strength system that isn't planning to kill us.

*   Mostly agree (misleading). A major hope is that (by using interpretability to carry out oversight) you simply don’t get the medium strength system that is planning to kill you.
*   Mostly agree. Interpretability is helpful for cooperation, and also helps to train a system that doesn't kill you if #27 doesn't hold.
*   Mostly agree - on it's own, seems correct, but the tone also understates that it would \*massively\* change the position we are in. If interpretability conclusively revealed that one of the existing prototypes was trying to kill us, that would dramatically change the {ML, global, AGI lab} conversation around xrisk/alignment
*   Mostly agree. Agree denotationally, disagree that this capability wouldn't be super useful

**#27\. Selecting for undetectability**  
**Summary:** Optimizing against an interpreted thought optimizes against interpretability.

*   Agree - important point to be careful about
*   Mostly agree (misleading, written to suggest that you definitely get the deceptive model, instead of it being unclear whether you get the deceptive or aligned model, which is the actually correct thing)
*   Not sure (good to be on the lookout for this, but not sure how much it's an issue in practice)

#28\. Large option space (no comments)  
**Summary:** A powerful AI searches parts of the option space we don't, and we can't foresee all its options.

**#29\. Real world is an opaque domain**  
**Summary:** AGI outputs go through a huge opaque domain before they have their real consequences, so we cannot evaluate consequences based on outputs. 

*   Agree (strongly) - seems particularly important when there are consequences we cannot easily observe/attribute (which seems like the rule in many consequential domains, rather than the exception)
*   Mostly agree (we can't just evaluate consequences directly, but may be able to do it by evaluating reasoning)

**#30\. Powerful vs understandable**  
**Summary:** No humanly checkable output is powerful enough to save the world.

*   Disagree (verification easier than generation)
*   Disagree (due to pivotal act framing)

**#31\. Hidden deception**  
**Summary:** You can't rely on behavioral inspection to determine facts about an AI which that AI might want to deceive you about.

*   Agree (for highly intelligent AI)
*   Agree (but with interpretability tools we don't have to be restricted to behavioral inspection)
*   Agree (I think?) E.g. I agree that we don't have good interpretability ways to check for "what the AI wants" or "what subgoals are relevant here" which is a particularly consequential question where AIs might be deceptive 
*   Unclear (depends on the system's level of situational awareness)

**#32\. Language is insufficient or unsafe**  
**Summary:** Imitating human text can only be powerful enough if it spawns an inner non-imitative intelligence.

*   Mostly agree (misleading, typical plans don't depend on an assumption that it's "imitating human thought")
*   Unclear - depends a lot on particular definitions

**#33\. Alien concepts**  
**Summary:** The AI does not think like you do, it is utterly alien on a staggering scale.

*   Agree (for highly intelligent AI)
*   Unclear (depends on details about the AI)
*   Unclear - don't think we know much about how NNs work, and what we do know is ambiguous, though agree with #25 above
*   Disagree (natural abstraction hypothesis seems likely true)

Section B.4:  Miscellaneous unworkable schemes (#34-36)
=======================================================

Summary
-------

![](https://lh5.googleusercontent.com/03BlT7z3Pd7Wk39kjJjBSj9Ep-rtDQGLoFR7x-hLKfYfg6kBWGrdiH3mJZTpFeJNqZXZ3FL34PKPbBt0j4jfygc0PA1xOLYw9BQNbQfnp2Jo2dVZXRSi0qKoxQ_qmWqL1AJy9PwrvXYfpAdBnzEB-p2T1juH26bpTuMve6YtJZZAC4kFgHxJ8Db-zes)

Detailed comments
-----------------

**#34\. Multipolar collusion**  
**Summary:** Humans cannot participate in coordination schemes between superintelligences.

*   Unclear (unconvinced this is an unusually-hard subcase of corrigibility for the AI we'd use to help us)

**#35\. Multi-agent is single-agent**  
**Summary:** Any system of sufficiently intelligent agents can probably behave as a single agent, even if you imagine you're playing them against each other.

*   Agree (at a sufficiently high level of intelligence I find it hard to imagine them playing any game we intend)
*   Unclear (disagree if this is meant to apply to debate, see [Paul's Disagreement #24](https://www.alignmentforum.org/posts/CoZhXrhpQxpy9xw9y/where-i-agree-and-disagree-with-eliezer#Disagreements))

#36\. Human flaws make containment difficult (no comments)  
**Summary:** Only relatively weak AGIs can be contained; the human operators are not secure systems.

Section C: "civilizational inadequacy" (#37-43)
===============================================

Summary
-------

![](https://lh4.googleusercontent.com/msG-AEKAsoOptq1_88nFTWvO7VppUuECg9nCp50xuscXNM3m5JKjelOU1dUde2c9gVpt8kSXdTHu1dT62Kmq2TGKLtQBey0Kjy7qU5WYFXibAXGg3BH_WuBgBKSeV3R8kJ1qZfDbd-sPxI74ZjCmwspVuAfKMjHEM9On_cod5v3z7wFKg-jzDB7Fa9A)

Detailed comments 
------------------

**#37\. Optimism until failure**  
**Summary:** People have a default assumption of optimism in the face of uncertainty, until encountering hard evidence of difficulty.

*   Mostly disagree (humanity seems pretty risk-averse generally, see FDA and other regulatory bodies, or helicopter parenting)

**#38\. Lack of focus on real safety problems**  
**Summary:** AI safety field is not being productive on the lethal problems. The incentives are for working on things where success is easier.

*   (x2) Unclear / can't evaluate (depends on field boundaries) 

**#39\. Can't train people in security mindset**  
**Summary:** This ability to "notice lethal difficulties without Eliezer Yudkowsky arguing you into noticing them" currently is an opaque piece of cognitive machinery to me, I do not know how to train it into others.

*   Unclear (this isn't making a claim about whether others have this machinery or are better at training?)
*   Disagree (seems wild to imagine that progress can only happen if someone came up with all the arguments themselves; this seems obviously contradicted by any existing research field)

**#40\. Can't just hire geniuses to solve alignment**  
**Summary:** You cannot just pay $5 million apiece to a bunch of legible geniuses from other fields and expect to get great alignment work out of them. 

*   Not sure (what have we tried?)

**#41\. You have to be able to write this list**  
**Summary:** Reading this document cannot make somebody a core alignment researcher, you have to be able to write it.

*   Mostly agree (but I think it can be one of a suite of things that does produce real alignment research)
*   Disagree (I think I both could have and often literally have written the arguments on this list that I agree with; it just doesn't seem like a particularly useful document to me relative to what already existed, except inasmuch as it shocks people into action)

**#42\. There's no plan**  
**Summary:** Surviving worlds probably have a plan for how to survive by this point.

*   Unclear (don't know how overdetermined building dangerous AGI is)
*   Disagree (depends on what is meant by a "plan", but either I think there's a plan, or I think many surviving worlds don't have a plan)

**#43\. Unawareness of the risks**  
**Summary:** Not enough people have noticed or understood the risks.

*   Mostly agree, especially on understanding
*   Disagree (you basically have to disagree if you have lower p(doom), there's not really an argument to respond to though)