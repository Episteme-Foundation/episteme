Summary and Table of Contents
=============================

The goal of this post is to discuss the so-called “sharp left turn”, the lessons that we learn from analogizing evolution to AGI development, and the claim that “capabilities generalize farther than alignment” … and the *competing* claims that all three of those things are complete baloney. In particular,

*   **Section 1** talks about “autonomous learning”, and the related human ability to discern whether ideas hang together and make sense, and how and if that applies to current and future AIs.
*   **Section 2** presents the case that “capabilities generalize farther than alignment”, by analogy with the evolution of humans.
*   **Section 3** argues that the analogy between AGI and the evolution of humans is not a great analogy. Instead, I offer a new and (I claim) better analogy between AGI training and, umm, a weird fictional story that has a lot to do with the evolution of humans, but it’s definitely not evolution, I swear. I draw some lessons from this improved analogy, including reasons for both reassurance and concern about an AGI “sharp left turn”.
*   **Section 4** presents the opposite case that “alignment generalizes farther than capabilities”.
*   **Section 5** tries to reconcile the two competing claims, partly in terms of different assumptions regarding the level of AI autonomy versus supervision. I wind up mostly pessimistic, but suggest some approaches that *might* work.

By the way, I categorized this post as part of the [2023 lesswrong annual review](https://www.lesswrong.com/tag/lesswrong-review), as it’s kinda a response to, and riff on, the following:

*   Nate Soares ([@So8res](https://www.lesswrong.com/users/so8res?mention=user)): [A central AI alignment problem: capabilities generalization, and the sharp left turn (2022)](https://www.lesswrong.com/posts/GNhMPAWcfBCASy8e6/a-central-ai-alignment-problem-capabilities-generalization). (…which elaborates on something also mentioned in Eliezer Yudkowsky [AGI Ruin: A List of Lethalities (2022)](https://www.lesswrong.com/posts/uMQ3cqWDPHhjtiesc/agi-ruin-a-list-of-lethalities))
*   [@Quintin Pope](https://www.lesswrong.com/users/quintin-pope?mention=user): [Evolution provides no evidence for the sharp left turn (2023)](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn), plus [Quintin Pope on the AXRP podcast (2023)](https://axrp.net/episode/2023/06/15/episode-22-shard-theory-quintin-pope.html#alignment-vs-cap-gen)
*   Beren Millidge ([@beren](https://www.lesswrong.com/users/beren-1?mention=user)): [Alignment likely generalizes further than capabilities (2024)](https://www.beren.io/2024-05-15-Alignment-Likely-Generalizes-Further-Than-Capabilities/)
*   Nate Soares: [Humans aren’t fitness maximizers (2022)](https://www.lesswrong.com/posts/CzrF5rsJWvccFdemb/humans-aren-t-fitness-maximizers)
*   [@Kaj_Sotala](https://www.lesswrong.com/users/kaj_sotala?mention=user): [Genetic fitness is a measure of selection strength, not the selection target (2023)](https://www.lesswrong.com/posts/BtffzD5yNB4CzSTJe/genetic-fitness-is-a-measure-of-selection-strength-not-the)
*   [@jacob_cannell](https://www.lesswrong.com/users/jacob_cannell?mention=user): [Evolution Solved Alignment (what sharp left turn?) (2023)](https://www.lesswrong.com/posts/xCCNdxNPpbJKD3x4W/evolution-solved-alignment-what-sharp-left-turn)
*   [@KatjaGrace](https://www.lesswrong.com/users/katjagrace?mention=user): [Have we really forsaken natural selection? (2024)](https://www.lesswrong.com/posts/xuokjPCDrZhNh2HLB/have-we-really-forsaken-natural-selection-1)

All these posts are well worth reading, but hopefully this post will be self-contained. There are other posts too, but I won’t be talking about them here.[^refms0rzyd]

*Target audience:* People very familiar with AI alignment discourse. Lots of unexplained jargon etc.

1\. Background: Autonomous learning
===================================

1.1 Intro
---------

AlphaZero had autonomous learning—the longer you train, the better the model weights. Humans (and collaborative groups of humans) also have that. Hence scientific progress.

For example, you can lock a group of mathematicians in a building for a month with some paper and pens, and they will come out with more and better permanent knowledge of mathematics than when they entered. They didn’t need any new training data; we just “ran them” for longer, and they improved, discovering new things arbitrarily far beyond the training data, with no end in sight.

How does it work? How do we “train” without new training data? Well for AlphaZero-chess, the trick is the integrated chess simulator, including a [hardcoded checkmate-detector](https://github.com/LeelaChessZero/lc0/blob/82dd466c5468375e86fd7062ba26c29aaa0dfaeb/src/chess/position.cc#L94), which ultimately provides infinite perfect ground truth in how games can play out and which positions are good versus bad. If we switch from chess to math, we can do the same trick via proof assistants like [Lean](https://en.wikipedia.org/wiki/Lean_\(proof_assistant\)), which can confirm, with perfect confidence, that a formal proof is correct. Thus, we can make AIs search for plausible proofs, and use Lean to check whether those “ideas” are correct, and theoretically the AI will get better and better at proving things. People are already building these kinds of systems—e.g. [AlphaGeometry](https://deepmind.google/discover/blog/alphageometry-an-olympiad-level-ai-system-for-geometry/)¸ [AlphaProof](https://deepmind.google/discover/blog/ai-solves-imo-problems-at-silver-medal-level/), and [DeepSeek-prover](https://arxiv.org/abs/2408.08152).

OK, so a bunch of human mathematicians locked in a building can do open-ended autonomous learning of math. And now thanks to these recent developments based on proof assistants, AI can do that too. Granted, AI hasn’t autonomously proven any long-standing mathematical conjectures yet, so human mathematicians can continue to congratulate themselves for still outclassing the AIs along this dimension. But when I wrote “AI hasn’t autonomously proven any long-standing mathematical conjectures yet”, you should be warned that I haven’t refreshed my AI news feed for *several hours*! So who knows, really.

…And there goes yet another argument that human brains are doing something qualitatively beyond AIs. Right?

Not so fast!

*Humans were able to do open-ended autonomous development of new math, building the whole edifice of modern math completely from scratch … without ever using proof assistants!*

That’s *definitely* something today’s AIs can’t do! So how does it work?

The magic ingredient is that human mathematicians have good *discernment* of whether things are plausible and make sense and hang together, even without proof assistants.

Does that matter? Who cares if we humans can do open-ended math without proof assistants? We *have* proof assistants! They’re free and open source!

Yes, it matters very much! Because we have an external source of infinite perfect judgment in formal math, but *not* in moral philosophy, or macroeconomics, or military strategy, or law, or running a business, or figuring out how to program and deploy AGI such that we get a good future, etc.

Our human *discernment* is a flexible system that can declare that ideas do or don’t hang together and make sense, in *any* domain. Whereas in AI, we have external engines of perfect judgment only in narrow areas—basically, the areas that are solvable at superhuman level by today’s RL, such as chess, video games, [OpenAI Gym](https://github.com/Farama-Foundation/Gymnasium), etc.

Well, I should be more specific. Any *particular* videogame can be set up in an RL framework, such that we get perfect external judgment of effective strategies. And likewise, any *particular* programming problem can be set up in a “[test-driven development](https://en.wikipedia.org/wiki/Test-driven_development)” environment to get perfect external judgment of effective code for this particular problem. But then, of course, one can *hope* that the trained model will immediately generalize to new coding problems that lack such external judgment tools (e.g. because the answer is not known).

If I understand correctly, RL from Verifiable Rewards (RLVR)[^ug0y8xg37sh]-based systems like GPT-o1 were probably likewise trained on *particular* problems in which the correct answer was known, providing perfect external judgment of effective chain-of-thought reasoning in those particular contexts. And then the researchers *hoped* that the trained models would immediately generalize to *also* use effective chain-of-thought reasoning in new contexts. That hope was evidently borne out to some extent, in that the trained models did indeed immediately generalize to better performance on new STEM problems. On the other hand, I hear that the models not only failed to improve in other domains like poetry, but actually regressed a bit—see the post [“The Problem With Reasoners” by Aidan McLaughlin](https://aidanmclaughlin.notion.site/reasoners-problem). I dunno.

Anyway, Quintin [summarizes](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn?commentId=EDwHRkDpMtMJBsEoB) this topic as follows: “Autonomous learning basically requires there to be a generator-discriminator gap in the domain in question, i.e., that the agent trying to improve its capabilities in said domain has to be better able to tell the difference between its own good and bad outputs. If it can do so, it can just produce a bunch of outputs, score their goodness, and train / reward itself on its better outputs.”

Yeah that’s part of it, but I think Quintin is still not appreciating the full magic of human discernment. In particular, the discernment can *itself* get better over time, despite no ground truth. For example, people who spend a lot of time thinking about math will develop much better discernment of what mathematical ideas are plausible and important—and again, they can do all that without ever using proof assistants.

1.2 More on “discernment” in human math
---------------------------------------

The word “discernment” is on my mind because of a set of great posts from 2015 by [@JonahS](https://www.lesswrong.com/users/jonahsinick?mention=user): [The Truth About Mathematical Ability](https://www.lesswrong.com/lw/lpf/the_truth_about_mathematical_ability/), [Innate Mathematical Ability](https://www.lesswrong.com/lw/lq3/innate_mathematical_ability/), and [Is Scott Alexander bad at math?](https://www.lesswrong.com/posts/7DQ2WxKLnYJ69aAZs/is-scott-alexander-bad-at-math) As I understand it, one of his main arguments is that you can be “good at math” along the dimension(s) of noticing patterns very quickly, AND/OR you can be “good at math” along the dimension(s) of what he calls “aesthetic discernment”—basically, a sense for concepts being plausible, sensible, and elegant.

Discernment is a bit like an *internal* loss function. It provides a guide-star for developing good, deep understanding. That process may take a very long time, during which you’ll feel confused and unsatisfied. But when you finally come upon a better way to think about something, you’ll know it when you see it.

JonahS offers Scott Alexander and himself as two examples of people with worse-than-average fast-pattern-recognition but unusually good discernment. Both had awful struggles with high school math, but JonahS wound up with a pure math PhD, while meanwhile (quoting Ilya Shpitser) “Scott's complaints about his math abilities often go like this: ‘Man, I wish I wasn't so terrible at math. Now if you will excuse me, I am going to tear the statistical methodology in this paper to pieces.’”

JonahS also brings up [Alexander Grothendieck](https://en.wikipedia.org/wiki/Alexander_Grothendieck), who was (I presume) perfectly fine at fast-pattern-recognition compared to normal people, but not compared to some of his fellow professional mathematicians. He wrote: “I admired the facility with which they picked up, as if at play, new ideas, juggling them as if familiar with them from the cradle - while for myself I felt clumsy. even oafish, wandering painfully up a arduous track, like a dumb ox faced with an amorphous mountain of things that I had to learn (so I was assured), things I felt incapable of understanding the essentials or following through to the end. Indeed, there was little about me that identified the kind of bright student who wins at prestigious competitions or assimilates, almost by sleight of hand, the most forbidding subjects.” However (says JonahS), Grothendieck had *legendary* discernment, which allowed him to almost single-handedly rebuild the foundations of a large swathe of modern math, and cemented his reputation as perhaps the greatest mathematician of the 20th century.

1.3 Three ingredients to progress: (1) generation, (2) selection, (3) open-ended accumulation
---------------------------------------------------------------------------------------------

Consider evolution. It involves (1) *generation* of multiple variations, (2) *selection* of the variations that work better, and (3) *open-ended accumulation* of new variation on top of the foundation of previous successful variation.

By the same token, scientific progress and other sorts of cultural evolution require (1) *generation* and transmission of ideas, and (2) *selection* of the ideas that are memetically fit (often because people *discern* that the ideas are true and/or useful) and (3) *open-ended accumulation* of new ideas on top of the foundation of old successful ideas.

(And ditto for inventing new technologies, and for individual learning, and so on.)

In [Evolution provides no evidence for the sharp left turn](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn), Quintin expounds at length on the (1) part of cultural evolution, basically making the argument:

*   Humans transmit ideas at a high bandwidth,
*   All other animals transmit ideas at a much, much lower bandwidth,
*   …And LLMs are more in the human category here.

Therefore (he continues), we shouldn’t expect any sharp discontinuity in the capabilities of future AI, analogous to the sharp (on evolutionary timescales) discontinuity in the capabilities of our hominid ancestors.

But I think Quintin is not telling the whole story, because he is omitting the roles of (2 & 3).

Don’t get me wrong: if we have AIs that participate in the (1) part of scientific progress and cultural evolution, but not the (2-3), then that’s still a big deal! Such an AI can stay abreast of existing human knowledge, and even contribute to it on the margin, particularly if there’s a human in the loop filling in the missing (2-3).

(*Without* that human in the loop, things can go off the rails into a proliferation of nonsense—think of the recent flood of misleading AI-generated images in search results, such as the screenshot [here](https://www.lesswrong.com/posts/H26ndkABmGvoc9PTC/conjecture-a-roadmap-for-cognitive-software-and-a-humanist#Algorithmic_Carcinogenesis).)

But adding (2-3) to the mix—i.e., adding in AIs that can assess whether ideas do or don’t hang together and make sense, and then can keep building from there—is an even bigger deal. With the whole (1-3) triad, an AI (or group of collaborating AIs) can achieve liftoff and rocket to the stratosphere, going arbitrarily far beyond existing human knowledge, just as human knowledge today has rocketed far beyond the human knowledge of ancient Egypt (and forget about chimps).

Or as I’ve written [previously](https://www.lesswrong.com/posts/PDx4ueLpvz5gxPEus/why-i-m-not-working-on-debate-rrm-elk-natural-abstractions#1_3_Why_I_want_to_move_the_goalposts_on__AGI_): the wrong idea is “AGI is about knowing how to do lots of things”; the right idea is “AGI is about *not* knowing how to do something, and then being able to figure it out”. This “figuring out” corresponds to the (1-3) triad.

1.4 Judgment via experiment, versus judgment via discernment
------------------------------------------------------------

***Question from a cynical audience member:*** “Yeah but humans don’t *really* have (2). Your examples of things without abundant ground truth—moral philosophy, economics, military strategy, law, running a business, AGI alignment and safety—line up almost exactly with fields of inquiry that are catastrophic messes, with no appreciable intellectual progress in the last fifty years. Funny coincidence, right? The only exception is when there is ground truth: for example, when military technology changes, old strategies are (eventually) abandoned only after numerous catastrophic failures, and likewise capitalism provides ground truth only by ineffective companies going bankrupt.”

***My response:*** There’s a kernel of truth in that, although as stated it’s *way* too strong. But first things first, that’s kinda orthogonal to what I’ve been saying so far.

Let’s split (2) into two subcategories:

*   (2A) judgment of ideas via new external evidence,
*   (2B) judgment of ideas via internal *discernment* of plausibility, elegance, self-consistency, consistency with already-existing knowledge and observations, etc.

An example of (2A) without (2B) is evolution by natural selection. An example of (2B) without (2A) is humans doing math without proof assistants. Most human intellectual progress involves a mix of *both* (2A) *and* (2B).

So far, I’ve been arguing that it’s important to think about the possibility of AI getting the whole (1-3) package. And that can happen via pure (2A), pure (2B), or a mix of both. Where it is on that spectrum is not *too* relevant to my larger point.

But still, it’s worth talking about. In particular, Quintin [writes](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn#Fast_takeoff_is_still_possible) that one of the only ways that fast takeoff could happen is:

> …AIs deliberately seeking out new training data that grant them useful capabilities. E.g., an AI trying to improve its bioengineering capabilities may set up a very fast cycle of gathering and analyzing new biological data, which significantly outpaces the rate of human scientific innovation…

Basically, he’s suggesting that we can ignore (2B), and treat (2A) as a bottleneck on AI knowledge. On this perspective, if we want to know how much an AI has pushed beyond the limits of human knowledge, we can just, y’know, count exactly how many new wet-lab experimental datasets the AI has gathered, and exactly how many FLOP worth of new ML training runs the AI has performed, etc.

If so, I think that’s complete nonsense.

In a healthy figuring-things-out endeavor, (2A) is the fuel, but (2B) is the engine and steering wheel.[^kp1a7t9eakk] Or more concretely: (2B) (a.k.a. theories, hypotheses, understanding, hunches, etc.) is the only way to actually figure out what real-world evidence would be useful, how to collect that evidence, and how to convert that new data into ever better understanding.

Just look at the history of any field of science or engineering, and you’ll see that some practitioners were *dramatically* better than others on the metric of “actual lasting progress per unit of real-world measurement effort”.

Indeed, in many cases, you don’t even need to take measurements, because the data already exists somewhere in the hundreds of thousands of already-published but poorly-analyzed papers. That certainly happens all the time in my own neuroscience research. (See related discussion by Aysja Johnson [here](https://www.lesswrong.com/posts/qbcuk8WwFnTZcXTd6/thomas-kwa-s-miri-research-experience?commentId=7nfkaigxmCKt82gLQ).)

Granted, evolution gets by on pure (2A) without any (2B), i.e. without understanding what it’s doing. But evolution is limited to tasks that allow an *extraordinary* amount of trial and error. All of the problems that I care about in regards to Safe and Beneficial AGI—developing new technologies, philosophy, understanding algorithms before running them, and anticipating and preempting novel societal problems—are heavily reliant on, and indeed (I strongly believe) bottlenecked by, (2B).

1.5 Where do foundation models fit in?
--------------------------------------

***Question from a short-AGI-timelines audience member:*** “But foundation models totally have discernment! Just ask a chatbot whether some idea is plausible, and it will give a decent answer. Indeed, just look at [GPT-o1 chain-of-thought examples](https://github.com/bradhilton/o1-chain-of-thought/tree/main)—they regularly have passages [like](https://github.com/bradhilton/o1-chain-of-thought/blob/main/examples/reddit.md?plain=1#L169) ‘Wait, but the error message is being raised by the serializer, so maybe the issue is that…’ That’s a perfect illustration of the model *discerning* whether an idea plausibly hangs together!”

***My response:*** I don’t think I ever said that foundation models lack discernment? My main goal here is to argue that the presence or absence of the full (1-3) triad is pertinent to the question of the “sharp left turn” and “capabilities generalizing farther than alignment”, *not* to argue against the possibility that foundation models won’t have that full triad next year, or indeed the possibility that (as suggested by gwern [here](https://www.lesswrong.com/posts/HiTjDZyWdLEGCDzqu/implications-of-the-inference-scaling-paradigm-for-ai-safety?commentId=MPNF8uSsi9mvZLxqz)) OpenAI’s not-yet-released models are already starting to really develop that full triad right now.

I *do* make the weaker claim that, as of this writing, publicly-available AI models do not have the full (1-3) triad—generation, selection, and open-ended accumulation—to any significant degree. Specifically, foundation models are not currently set up to do the “selection” in a way that “accumulates”. For example, at an individual level, if a human realizes that something doesn’t make sense, they can and will alter their permanent knowledge store to excise that belief. Likewise, at a group level, in a healthy human scientific community, the latest textbooks delete the ideas that have turned out to be wrong, and the next generation of scientists learns from those now-improved textbooks. But for currently-available foundation models, I don’t think there’s anything analogous to that. The accumulation can only happen within a context window (which is IMO far more limited than weight updates), and also within pre- and post-training (which are in some ways anchored to existing human knowledge; see discussion of RLVR in §1.1 above).

…But again, I haven’t refreshed my AI news feed in several hours, so who knows really.

2\. The sense in which “capabilities generalize further than alignment”
=======================================================================

2.1 Quotes
----------

On one side of the debate we have Eliezer Yudkowsky, who writes in [AGI Ruin: A List of Lethalities](https://www.lesswrong.com/posts/uMQ3cqWDPHhjtiesc/agi-ruin-a-list-of-lethalities):

> There's something like a single answer, or a single bucket of answers, for questions like ‘What's the environment really like?’ and ‘How do I figure out the environment?’ and ‘Which of my possible outputs interact with reality in a way that causes reality to have certain properties?’, where a simple outer optimization loop will straightforwardly shove optimizees into this bucket.  When you have a wrong belief, reality hits back at your wrong predictions.  When you have a broken belief-updater, reality hits back at your broken predictive mechanism via predictive losses, and a gradient descent update fixes the problem in a simple way that can easily cohere with all the other predictive stuff.  In contrast, when it comes to a choice of utility function, there are unbounded degrees of freedom and multiple reflectively coherent fixpoints.  Reality doesn’t ‘hit back’ against things that are locally aligned with the loss function on a particular range of test cases, but globally misaligned on a wider range of test cases.  This is the very abstract story about why hominids, once they finally started to generalize, generalized their *capabilities* to Moon landings, but their inner optimization no longer adhered very well to the outer-optimization goal of ‘relative inclusive reproductive fitness’ - even though they were in their ancestral environment optimized very strictly around this one thing and nothing else.  This abstract dynamic is something you'd expect to be true about outer optimization loops on the order of both ‘natural selection’ and ‘gradient descent’.  The central result:  **Capabilities generalize further than alignment once capabilities start to generalize far**.

Or his coworker Nate Soares in [A central AI alignment problem: capabilities generalization, and the sharp left turn](https://www.lesswrong.com/posts/GNhMPAWcfBCASy8e6/a-central-ai-alignment-problem-capabilities-generalization):

> My guess for how AI progress goes is that at some point, some team gets an AI that starts generalizing sufficiently well, sufficiently far outside of its training distribution, that it can gain mastery of fields like physics, bioengineering, and psychology, to a high enough degree that it more-or-less singlehandedly threatens the entire world. Probably without needing explicit training for its most skilled feats, any more than humans needed many generations of killing off the least-successful rocket engineers to refine our brains towards rocket-engineering before humanity managed to achieve a moon landing.
> 
> And in the same stroke that its capabilities leap forward, its alignment properties are revealed to be shallow, and to fail to generalize. The central analogy here is that optimizing apes for inclusive genetic fitness (IGF) doesn't make the resulting humans optimize mentally for IGF. Like, sure, the apes are eating because they have a hunger instinct and having sex because it feels good—but it's not like they *could* be eating/fornicating due to explicit reasoning about how those activities lead to more IGF. They can't yet perform the sort of abstract reasoning that would correctly justify those actions in terms of IGF. And then, when they start to generalize well in the way of humans, they predictably don't *suddenly start* eating/fornicating *because* of abstract reasoning about IGF, even though they now *could*. Instead, they invent condoms, and fight you if you try to remove their enjoyment of good food (telling them to just calculate IGF manually). The alignment properties you lauded before the capabilities started to generalize, predictably fail to generalize with the capabilities.

2.2 In terms of the (1-3) triad
-------------------------------

Let’s bring this back to the (1) generation - (2) selection - (3) open-ended accumulation triad that I was discussing in §1.3 above—the triad that underpins the gradual development of science, technology, and so on *from scratch*. I think the idea that Eliezer & Nate are suggesting is:

*   Chimps did not have this triad.
*   Then humans developed this triad, and consequently invented the scientific method and math and biology and nuclear weapons and condoms and Fortnite and so on—and all of this happened from scratch and autonomously.
*   All this new knowledge, new understanding, and new options constituted a massive self-generated *distribution shift*. In the ancestral environment, videogames and hormonal birth control and ice cream were not among the options to choose from, but now they are.
*   Capabilities generalized across this distribution shift, because the powerful (1-3) triad works in any possible orderly universe. The same Scientific Method algorithm works in both 17th-century physics and 21st-century biotech, just as the same evolution-by-natural-selection algorithm works in both amoebas and crows. All we need for (2) is that the universe itself provides infinite perfect ground truth for things being true or false, and for plans working or failing.
*   Alignment did *not* generalize across this distribution shift, because why would it? There’s no infinite perfect ground truth for things being good or bad, analogous to the infinite perfect ground truth of experiments and self-consistency and Occam’s razor proving ideas true or false.

“…But wait!”, say a new set of objectors. “*Did* alignment generalize across the distribution shift, in the case of humans?”

That’s its own debate: for example, Eliezer and Nate say no (see above, plus “[Humans aren’t fitness maximizers](https://www.lesswrong.com/posts/CzrF5rsJWvccFdemb/humans-aren-t-fitness-maximizers)”), while Jacob Cannell says yes (“[Evolution Solved Alignment (what sharp left turn?)](https://www.lesswrong.com/posts/xCCNdxNPpbJKD3x4W/evolution-solved-alignment-what-sharp-left-turn)”), and so does Katja Grace (“[Have we really forsaken natural selection?](https://www.lesswrong.com/posts/xuokjPCDrZhNh2HLB/have-we-really-forsaken-natural-selection-1)”). Let’s turn to that debate next.

3\. “Definitely-not-evolution-I-swear” Provides Evidence for the Sharp Left Turn
================================================================================

3.1 Evolution *per se* isn’t the tightest analogy we have to AGI
----------------------------------------------------------------

[I think it’s perfectly great and useful](https://www.lesswrong.com/posts/xCCNdxNPpbJKD3x4W/evolution-solved-alignment-what-sharp-left-turn?commentId=DCejN5hcdgJcuRrDr) to make true claims about learning algorithms *in general*, and then to use evolution as an existence proof or example to illustrate those claims.

But once we get past the basics and into the expert commentary—past the existence proofs, and into the trickier domain of whether some specific learning algorithm is likely or unlikely to exhibit some specific behavior—then we run into the problem that learning algorithms *in general* are too broad a category to get anywhere with.

And in particular, I join [Quintin](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn) in the belief that the evolution learning algorithm is sufficiently different from how AGI training will probably work, that it’s hard to transfer much substantive lessons from one to the other.

I prefer the right column here:

![](https://res.cloudinary.com/lesswrong-2-0/image/upload/v1673032108/mirroredImages/wucncPjud27mLWZzQ/xy6etv9yqk45g6bv5nx9.png)

Copied from [\[Intro to brain-like-AGI safety\] 10. The alignment problem](https://www.lesswrong.com/posts/wucncPjud27mLWZzQ/intro-to-brain-like-agi-safety-10-the-alignment-problem).

Or here’s another version (copied from [\[Intro to brain-like-AGI safety\] 8. Takeaways from neuro 1/2: On AGI development](https://www.lesswrong.com/posts/fDPsYdDtkzhBp9A8D/intro-to-brain-like-agi-safety-8-takeaways-from-neuro-1-2-on)).

| **“Genome =** **ML code” analogy** |   |
| --- | --- |
| Human intelligence | Today’s machine learning systems |
| Human genome | GitHub repository with all the PyTorch code for training and running the Pac-Man-playing agent |
| Within-lifetime learning | Training the Pac-Man-playing agent |
| How an adult human thinks and acts | Trained Pac-Man-playing agent |
| Evolution | *Maybe* the ML researchers did an outer-loop search for a handful of human-legible adjustable parameters—e.g., automated hyperparameter tuning, or neural architecture search. |

…And see also my 2021 post, [Against evolution as an analogy for how humans will create AGI](https://www.lesswrong.com/posts/pz7Mxyr7Ac43tWMaC/against-evolution-as-an-analogy-for-how-humans-will-create).

So I’m not wild about the evolution analogy, as conventionally presented and explained. Let’s do better!

3.2 “The story of Ev”
---------------------

We imagine some “intelligent designer” demigod, let’s call her Ev. In this fictional story, the human brain and body were not designed by evolution, but rather by Ev. So, Ev’s role building humans will be analogous to future programmers’ role building AGI.

Ev was working 100,000 years ago (a time when, in the real world, humans had not yet left Africa, but had basically similar anatomy and intelligence as we have now). And her design goal was for these humans to have high inclusive genetic fitness (IGF).

([Kaj interjects](https://www.lesswrong.com/posts/BtffzD5yNB4CzSTJe/genetic-fitness-is-a-measure-of-selection-strength-not-the) with a nitpicky detail: That doesn’t quite make sense as stated, because the average IGF across the species is fixed by definition—it’s a relative metric. Rather, Ev wanted each individual to be at roughly a local maximum of their own IGF, holding the rest of the species fixed. You know what I mean.)

OK, so Ev pulls out a blank piece of paper. First things first: She designed the human brain with a [fancy large-scale within-lifetime learning algorithm](https://www.lesswrong.com/posts/wBHSYwqssBGCnwvHg/intro-to-brain-like-agi-safety-2-learning-from-scratch-in), so that these humans can gradually get to understand the world and take good actions in it.

Supporting that learning algorithm, she needs a [reward function, a.k.a. “primary rewards”, a.k.a. “innate drives”](https://www.lesswrong.com/posts/hE56gYi5d68uux9oM/intro-to-brain-like-agi-safety-3-two-subsystems-learning-and). What to do there? Well, she spends a good deal of time thinking about it, and winds up putting in lots of perfectly sensible components for perfectly sensible reasons.

For example: She wanted the humans to not get injured, so she installed in the human body a system to detect physical injury, and put in the brain an innate drive to avoid getting those injuries, via an innate aversion (negative reward) related to “pain”. And she wanted the humans to eat sugary food, so she put a sweet-food-detector on the tongue and installed in the brain an innate drive to trigger reinforcement (positive reward) when that detector goes off (but modulated by hunger, as detected by yet another system). And so on.

Then she did some debugging and hyperparameter tweaking by running groups of these newly-designed humans in the test environment (the Africa of 100,000 years ago) and seeing how they do.

So that’s how Ev designed humans. Then she “pressed go” and let them run for 100,000 years, and then came back in the year 2025 to take a look. What does she think?

If you read Kaj Sotala’s “[Genetic fitness is a measure of selection strength, not the selection target](https://www.lesswrong.com/posts/BtffzD5yNB4CzSTJe/genetic-fitness-is-a-measure-of-selection-strength-not-the)”, you get an answer like: “Well, Ev put those innate drives in, and we still have them, and our behavior is still reflective of that. We still like sweet tastes! We still like eating when hungry! We still like sex! Etc. So things are working out as Ev intended!”

Well, yeah, those things are all true. But at the same time, I mean, *c’mon*! Look at how Ev left things 100,000 years ago, and then look at the lives we live today. It’s a pretty wild change! I think it’s fair to say that modern humans are doing things, and wanting things, that Ev would never have expected. Remember, she’s merely an intelligent designer demigod; she’s not omniscient.

3.3 Ways that Ev would have been surprised by exactly how modern humans turned out
----------------------------------------------------------------------------------

For example:

***Superstitions and fashions:*** Some people care, sometimes very intensely, about pretty arbitrary things that Ev could not have possibly anticipated in detail, like where Jupiter is in the sky, and [*exactly*](https://en.wikipedia.org/wiki/Criminal_tattoo) what tattoos they have on their body.

***Lack of reflective equilibrium resulting in self-modification:*** Ev put a lot of work into her design, but sometimes people don’t like some of the innate drives or other design features that Ev put into them, so the people go right ahead and change them! For example, they don’t like how Ev designed their hunger drive, so they take Ozempic. They don’t like how Ev designed their attentional system, so they take Adderall. They don’t like how Ev designed their reproductive systems, so they take hormonal birth control. And so on. Ev had some inkling that this kind of thing could happen, as certain psychoactive drugs and contraception methods were around in her “test environment” too. But I think she would be surprised at how things turned out in detail.

***New technology / situations leading to new preferences and behaviors:*** When Ev created the innate taste drives, she was thinking about the food options available in the “test environment” (Africa 100,000 years ago), and thinking about what drives would lead to people making IGF-maximizing eating choices in that situation. And she came up with a sensible and effective design for taste receptors and associated innate drives that worked well for that circumstance. But maybe she wasn’t thinking that humans would go on to create a world full of ice cream and Coca Cola and so on. Likewise, Ev put in some innate drives related to novelty and aesthetics, with the idea that people would wind up exploring their local environment. Very sensible! But Ev would probably be surprised that her design is now leading to people “exploring” open-world video game environments while cooped up inside. Ditto with social media, television, raising puppies, virtual friends, fentanyl, and a zillion other aspects of modern life. Ev probably didn’t see any of these things coming when she was drawing up and debugging her design, certainly not in any detail.

![](https://39669.cdn.cke-cs.com/rQvD3VnunXZu34m86e5f/images/634b62dff5c6d0e67d326e09aa603cb184ded2f103d8a911.png)

Ev built our [aesthetics-related drives](https://www.lesswrong.com/posts/hsf7tQgjTZfHjiExn/my-take-on-jacob-cannell-s-take-on-agi-safety#1_3_1_Example__our_disagreement_about_habitat_related_aesthetics) with the idea that we would feel motivated to view our surroundings from a great height—since that leads to seeing the locations of resources, threats, etc. Ev did *not* build them with the idea that we would sit inside all day and play [Zelda](https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_Breath_of_the_Wild). Oops!

3.4 The arc of progress is long, but it bends towards reward hacking
--------------------------------------------------------------------

That last one is a pattern that maybe Ev could generalize and update from. Think about it: Ice cream, video games, social media, television, raising puppies, virtual friends, fentanyl … These all kinda have something in common, right? They feel more reward hacking (a.k.a. specification gaming) than what came before. They hit our innate drives harder and more directly.

To be clear: Within any one lifetime, it’s perfectly possible and common to not want to reward-hack. As the saying goes: [Reward is not the optimization target](https://www.lesswrong.com/posts/pdaGN6pQyQarFHXF4/reward-is-not-the-optimization-target). For example, I don't want to do cocaine right now. If you have some theory of reinforcement learning that predicts that I want to do cocaine right now, then sorry, your theory is wrong, and you should go fix it. (For my own technical discussion of how you messed up, see [§9.4-§9.5 at this link](https://www.lesswrong.com/posts/vpdJz4k5BgGzuGo7A/intro-to-brain-like-agi-safety-9-takeaways-from-neuro-2-2-on#9_4_Wireheading__possible_but_not_inevitable).) But at the same time, it does seem like, given enough time and technological powers, our culture does seem to often drift in reward-hack-y and wirehead-y directions.

Now, our strongest and most cherished values come ultimately from innate drives too. These innate drives are *not* the ones hooked up to taste buds or pain receptors, but rather what I call “social instincts”—see [Neuroscience of human social instincts: a sketch](https://www.lesswrong.com/posts/kYvbHCDeMTCTE9TAj/neuroscience-of-human-social-instincts-a-sketch) for some ideas about how they might work. I think that current technology generally doesn’t allow us to hack those drives very effectively. We target them a little bit via puppies, social media, and so on, but by and large our core values are still centered on, and derived from interacting with, other flesh-and-blood humans.

…And wow, this suddenly makes me feel much more concerned about where the whole “virtual friends” thing is going. Character.ai [recently claimed](https://blog.character.ai/optimizing-ai-inference-at-character-ai/#:~:text=Character.AI%20serves%20around%2020%2C000%20queries%20per%20second%20%E2%80%93%20about%2020%25%20of%20the%20request%20volume%20served%20by%20Google%20Search) that they were serving 20,000 queries per second. That’s a lot already, but in the future, presumably they and their competitors will use much better LLMs, and attach them to charismatic expressive animated faces and voices, plus voice and video input. At that point, the whole human social world—friendship, love, norm-following, status-seeking, self-image, helping the downtrodden, etc.—might be in for a wrenching change, when it has to compete with this new unprecedented upstart competition.

To be clear, I’m much more concerned about AGI than virtual friends. But I wanted to bring this up because, if this kind of thing is a possible failure mode for future humans, then it’s a possible failure mode for [future AGIs that have human-like social instincts](https://www.lesswrong.com/posts/Sd4QvG4ZyjynZuHGt/intro-to-brain-like-agi-safety-12-two-paths-forward) too.

3.5 How does Ev feel, overall?
------------------------------

Beyond all these surprises, recall that in the test environment of Pleistocene Africa, Ev succeeded at making each human approximately a local optimum of inclusive genetic fitness (IGF), holding the rest of the species fixed. But she was *not* able to accomplish that by making humans *explicitly desire* to be at a local optimum of IGF.

And we *still* don’t explicitly desire that—otherwise people would be bidding their life savings for the privilege of being a sperm donor.

…Granted, that’s not a surprise! When Ev made her design, she would have had no reason to expect that people would explicitly care about IGF. And then she confirmed this in her test environment, where indeed, nobody even knew what “IGF” meant.

But Ev might have been surprised to see the *consequences* of that lack of explicit desire for IGF become far more profound, as humans’ ability to sculpt their own environment got more powerful.

In other words: in the test environment (100,000 years ago), Ev was able to get decently IGF-maximizing behaviors *despite* not having any way to make IGF an explicit goal in the humans’ minds. But once humans could transform their knowledge, technology, and society way out of distribution, the absence of IGF as an explicit goal started biting harder. The behaviors of her creations became much more obviously divorced from IGF maximization.

…But wait! Jacob Cannell’s [Evolution Solved Alignment (what sharp left turn?)](https://www.lesswrong.com/posts/xCCNdxNPpbJKD3x4W/evolution-solved-alignment-what-sharp-left-turn), and Katja Grace’s [Have we really forsaken natural selection?](https://www.lesswrong.com/posts/xuokjPCDrZhNh2HLB/have-we-really-forsaken-natural-selection-1), have a response, which I’ll summarize basically as follows:

> OK, but in the grand scheme of things, y’know, *Ev should be feeling pretty good*! Granted, most humans today are nowhere close to IGF-maximizing behaviors. But hey, we haven’t gone extinct either! And while we’re not having *many* kids—most countries are [well below the replacement rate of ≈2.1 births per woman](https://ourworldindata.org/grapher/children-per-woman-un)—we’re still having *some* kids, and most of us are still motivated to have kids, even if it’s never quite the right time, alas. And maybe we or our descendants or brain-uploads or whatever will be colonizing the universe, which is the natural generalization of IGF into the transhumanist future. So really, Ev should be patting herself on the back. …And if our situation as AGI programmers is analogous to Ev’s situation, then that’s good news for us!

Is that right? Is Ev happy with how things are going today, or not? And will Ev be happy with how things go in the future? Keep in mind that we humans are nowhere near the end of technological transformation; “The distribution will continue shifting [until morale improves](https://english.stackexchange.com/questions/371325/origin-of-the-beatings-will-continue-until-morale-improves)”. Does Ev care about literal DNA molecules, or will Ev still feel good if future medical technology replaces DNA with magical cancer-proof XNA? How will Ev feel if we upload our minds to computers? How will Ev feel if humans go extinct but our AI creations colonize the galaxy?

*…These are all very stupid questions.* Ev is a fictional character. We can ascribe to her many different possible end-goals, *any* of which would have led to her creating the same ancient humans. Maybe the XNA thing never occurred to Ev, during her design process. If 100,000 years later, Ev notices that humans have all autonomously switched from DNA to XNA, then she would presumably find it surprising. Would she find it a *neutral-to-pleasant* surprise, because her original goal was ‘IGF as defined in terms of any old nucleic acid’? Or would she find it a *catastrophically unpleasant* surprise, because she was going for ‘IGF as defined in terms of DNA in particular’? Either is possible—you can make up your own headcanon.

But the point is: Ev *is* surprised. And we may look at the things that surprised Ev, and wonder whether future human AGI programmers will be analogously surprised by what *their* AGIs wind up doing. And we can wonder if the surprises might be unpleasant.

3.6 Spelling out the analogy
----------------------------

Just to make sure everyone is following along, 

| Ev, the intelligent designer demigod | ↔   | Future programmers building AGI |
| --- | --- | --- |
| Human within-lifetime learning | ↔   | AGI training |
| Adult humans | ↔   | “Trained” AGIs (but, like adult humans, they really never stop learning new things) |
| Ev “presses go” and lets human civilization “run” for 100,000 years before checking back in to see how things are going | ↔   | AGI(s) autonomously figure things out and get things done, without detailed human understanding and approval (see below on whether we should expect this to happen) |
| Modern humans care about (and do) lots of things that Ev would have been hard-pressed to anticipate, even though Ev designed their innate drives and within-lifetime learning algorithm in full detail | ↔   | Even if we carefully design the “innate drives” of future AGIs, we should expect to be surprised about what those AGIs end up caring about, particularly when the AGIs have an inconceivably vast action space thanks to being able to invent new technology and new ideas |

3.7 Just how “sharp” is this “left turn”?
-----------------------------------------

We might suppose that Ev has done this activity many times—being an immortal demigod, she designed wasps, trees, and so on, always checking back after 5000 generations to see how things went. (To make the analogy work, let’s assume that 5000 generations is too short for appreciable new evolution to happen; we’re stuck with Ev’s design.)

Sometimes, when Ev comes back, she’s surprised by what her creations are doing.

When she’s surprised, it’s usually because of *exogenous* distribution-shifts—maybe another species appeared on the scene, or maybe the climate got colder, etc. And now the animal is behaving in a non-adaptive way that surprises Ev.

Less often, Ev is surprised by *self-generated* distribution shifts—for example, maybe the animal species digs holes, which over the eons changes the soil composition so as to reshape their own habitat.

But I think it’s safe to say that Ev has never been so surprised by the behavior of her creations, as when she checked back in on humans. I think humans are responsible for a self-generated distribution shift whose speed and wildness are unmatched in Ev’s experience.

And no, per [Quintin’s objection](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn), this just isn’t about the one-time transition from zero-science to nonzero-science. Quite the contrary: if Ev fast-forwarded *again*, from right now to another 100,000 years in the future, then I’m confident she would be *even more* shocked by what’s going on. We humans are *still* looping the (1-3) triad (§1.3 above), and it’s *still* causing new self-generated distribution shifts, with no end in sight.

Back to AGI, if you agree with me that today’s already-released AIs *don’t* have the full (1-3) triad to any appreciable degree, and that future AI algorithms or training approaches *will*, then there’s going to be a transition between here and there. And this transition might look like someone running a new training run, from random initialization, with a better learning algorithm or training approach than before. While the previous training runs create AIs along the lines that we’re used to, maybe the new one would be like (as [gwern said](https://www.lesswrong.com/posts/HiTjDZyWdLEGCDzqu/implications-of-the-inference-scaling-paradigm-for-ai-safety?commentId=MPNF8uSsi9mvZLxqz)) “watching the AlphaGo Elo curves: it just keeps going up… and up… and up…”. Or, of course, it might be more gradual than literally a single run with a better setup. Hard to say for sure. My money would be on “more gradual than literally a single run”, but my cynical expectation is that the (maybe a couple years of) transition time will be squandered, for various reasons in [§3.3 here](https://www.lesswrong.com/posts/LJD4C7KAr64onL8fq/response-to-dileep-george-agi-safety-warrants-planning-ahead#3_3_Problems_can_arise__too_quickly_to_react_and_adapt__without_arising__infinitely_quickly_).

I do expect that there will be a future AI advance that opens up full-fledged (1-3) triad in *any* domain, from math-without-proof-assistants, to economics, to philosophy, and everything else. After all, that’s what happened in humans. Like I said in §1.1, our human *discernment*, (a.k.a. (2B)) is a flexible system that can declare that ideas do or don’t hang together and make sense, regardless of its domain.

…Anyway, these ever-expanding competencies, however “sharply” they arise, would come in lockstep with a self-generation distribution shift, as the AGI has now acquired new options and new ideas, undreamt of in our philosophy. And just as Ev was surprised by modern human decisions, we might likewise be surprised by what the AGI feels motivated to do, and how.

3.8 Objection: In this story, “Ev” is pretty stupid. Many of those “surprises” were in fact readily predictable! Future AGI programmers can do better.
------------------------------------------------------------------------------------------------------------------------------------------------------

I hope so! On the other hand:

*   I expect *at least some* future AGI programmers to be very stupid indeed about thinking through the eventual safety consequences of the innate drives that they install, on the basis that this is very true today. For example, Yann LeCun keeps proposing to put certain innate drives into AGI that will “obviously” (from my perspective) lead to callous power-seeking behavior (see [here](https://www.lesswrong.com/posts/C5guLAx7ieQoowv3d/lecun-s-a-path-towards-autonomous-machine-intelligence-has-1)), despite this fact being repeatedly pointed out to him (see [here](https://twitter.com/tobyordoxford/status/1637899261051564032)).
*   Hindsight is 20/20. Again, a future AGI will have an extraordinarily broad action space, including lots of out-of-the-box ideas that would have never occurred to us, like endeavoring to transform society and invent new technology and so on. Predicting what they will decide to do, given those unfathomable options, seems hard.

3.9 Objection: We have tools at our disposal that “Ev” above was not using, like better sandbox testing, interpretability, corrigibility, and supervision
---------------------------------------------------------------------------------------------------------------------------------------------------------

This is an important point. Actually, it’s *two* important points: “pre-deployment tools” and “real-time supervision tools”. For example, sandbox testing is part of the former, corrigibility and spot-checks are part of the latter, and interpretability can be part of either or both.

Start with “pre-deployment” testing. I’m for it! But I don’t think we can get *high* confidence that way. By analogy, I’m radically uncertain about what future humanity will be like (if indeed it exists at all) despite having seen tons of human behavior in the past and present environment, and despite introspective access to at least my own mind.

The basic issue here is that AI with the (1-3) triad (§1.3 above) can learn and grow, autonomously and open-endedly, involving new ideas, new options, and hence distribution shifts and ontological crises. You can’t make an AI CEO unless it can *keep* figuring out new things, in new domains, which can’t be predicted in advance. The analogy is to how a human’s goals and values may change over the course of decades, not how they change over the course of answering one question—more discussion [here](https://www.lesswrong.com/posts/YyosBAutg4bzScaLu/thoughts-on-ai-is-easy-to-control-by-pope-and-belrose?commentId=CgaKLBGhb8HaFHg8w).

Next, what about “real-time supervision”—corrigibility, spot-checks, applying interpretability tools as the model runs, and so on?

That’s a bigger deal. Remember, Ev was chilling on Mount Olympus for 100,000 years, while humans did whatever they wanted. Surely we humans can supervise our AIs more closely than that, right? And if so, that really changes the mental image.

Is it plausible, though? Good question, which brings us to our next topic:

4\. The sense in which “alignment generalizes further than capabilities”
========================================================================

Now that the “capabilities generalize further” side has had its say, let’s turn to the other side. We have Beren Millidge’s [Alignment likely generalizes further than capabilities](https://www.beren.io/2024-05-15-Alignment-Likely-Generalizes-Further-Than-Capabilities/), along with Quintin Pope’s [Evolution provides no evidence for the sharp left turn](https://www.lesswrong.com/posts/hvz9qjWyv8cLX9JJR/evolution-provides-no-evidence-for-the-sharp-left-turn), plus his further elaboration [on the AXRP podcast](https://axrp.net/episode/2023/06/15/episode-22-shard-theory-quintin-pope.html#alignment-vs-cap-gen).

Here’s my summary of their main point. If you look at humans, it’s generally a lot easier to figure out what they want to happen, then to figure out how to make those things happen. In other words, if humans can impart preferences into an AI at all, then they can impart preferences about things that nobody knows how to do yet. For example, I am a human, and I don’t know how to make a super-plague, but I sure do have an opinion about making super-plagues: I’m against it.

Presumably (according to this school of thought), we’ll align future AIs via some combination of human feedback and human observations, directly or indirectly. And this will be plenty for those AIs to understand what humans want, and make decisions that humans are happy about, way past its capability level. And if the AI is ever unsure, it can always check in with the human, or act conservatively.

5\. Contrasting the two sides
=============================

*   The optimistic “alignment generalizes farther” argument is saying: if the AI is robustly motivated to be obedient (or helpful, or harmless, or whatever), then that motivation can guide its actions in a rather wide variety of situations.
*   The pessimistic “capabilities generalize farther” counterargument is saying: hang on, *is* the AI robustly motivated to be obedient? Or is it motivated to be obedient in a way that is not resilient to the wrenching distribution shifts that we get when the AI has the (1-3) triad (§1.3 above) looping around and around, repeatedly changing its ontology, ideas, and available options?

The optimists then have a few possible replies here. Let’s go through them.

5.1 Three ways to feel optimistic, and why I’m somewhat skeptical of each
-------------------------------------------------------------------------

### 5.1.1 The argument that humans will stay abreast of the (1-3) loop, possibly because they’re part of it

The first way to feel optimistic is to say that the AIs will *not* be autonomously and open-endedly running the (1-3) triad. Instead, humans will be in the loop pretty much every step of the way.

That way, if the *AI-human team* figures something out—opening up new options and new ways of thinking about things—the human can clarify their preferences and opinions in light of that discovery.

I think a lot of optimists are getting their optimism from this category, because this is how people use foundation models today.

…But I’m not so reassured. I think this is a case where it’s wrong to extrapolate the present into the future.

To be clear, I’m very happy about how people use foundation models today! They’re productivity enhancers, just like arxiv and word processing are productivity enhancers. But foundation models today (I claim) don’t have the full (1-3) triad to any appreciable degree by themselves, and therefore humans *need* to supply the (2-3). I don’t think we can generalize that situation into the future. People will eventually develop AIs that “achieve liftoff” with the (1-3) triad, and we need to be ready for that transition, and whatever new issues it may bring.

So when people plan for future “automated alignment research”, they’re welcome to assume that future human alignment researchers will be getting a productivity boost of, I dunno, 50% or whatever, thanks to their ever-better AI tools. But I also see a lot of people talking instead about 10× productivity boosts, or even complete human substitution. I don’t think that’s on the table until *after* the transition to more dangerous AIs that can really autonomously and open-endedly run the (1-3) loop. So saying AIs will help *do* alignment research, and not just *be a helpful tool* for alignment research, is a chicken-and-egg error.

### 5.1.2 The argument that, *even if* an AI is autonomously running a (1-3) loop, that will not undermine obedient (or helpful, or harmless, or whatever) motivation

A second way to feel optimistic is to suggest that it’s fine for AI to autonomously run the (1-3) triad, because its good motivations will persist.

More concretely, suppose we *just* want the AIs to solve specific technical problems. It’s fine if the AI uses its (1-3) superpowers, because it will *only* be using them in service of this technical problem.

Thus, if the AI is working on the inverse protein folding problem, then its (1-3) superpowers will help it find new better ways to think about the problem, and creative out-of-the-box ways to attack it. And ditto if it’s refactoring code, and ditto if it’s choosing a location for a solar cell factory, or whatever else we have in mind.

But (the story continues) the AI will *not* be applying its (1-3) superpowers to find creative out-of-the-box new ways to, umm, “scratch its internal itches”, that are more adjacent to wireheading, and that may come wildly apart from its earlier obedient / helpful / whatever behavior, just as playing Zelda is wildly different from the traditional climbing behavior that we were previously employing to satisfy our drive to enjoy beautiful vistas.

…But I’m not so reassured. In this case, I have two concerns.

**My first concern** is the obvious one: we *want* the AI to only apply its (1-3) superpowers towards such-and-such technical problem, but *not* apply (1-3) superpowers towards profoundly rethinking how to “scratch its internal itches”. But how do we ensure that? You can find a very pessimistic take on Nate’s side of Holden Karnofsky’s [Discussion with Nate Soares on a key alignment difficulty (2023)](https://www.lesswrong.com/posts/iy2o4nQj9DnQD7Yhj/discussion-with-nate-soares-on-a-key-alignment-difficulty)—basically, he argues that (1-3) requires metacognition, and metacognition leads to self-reflection and self-reconceptualization, and thence to trouble. I’m not sure whether I buy that (see Holden’s counterarguments at the link). I think I would want to know more about the exact nature of the AI algorithm / training approach, and particularly how it got the full (1-3) triad, before expressing any strong opinion. From where I am right now, this step seems neither fine-by-default nor doomed, and merits further thought.

**My second concern** is that *“AIs solving specific technical problems that the human wants them to solve”* is insufficient to avoid extinction and get to a good future—*even if* the AI is solving those problems at superhuman level and with the help of (1-3) superpowers.[^mk5lbq2uco]

I won’t go much into details of why I have this concern, since I want to keep this post focused on technical alignment. But I’ll spend just a few paragraphs to give a hint. For more, see my [What does it take to defend the world against out-of-control AGIs?](https://www.lesswrong.com/posts/LFNXiQuGrar3duBzJ/what-does-it-take-to-defend-the-world-against-out-of-control) and John Wentworth’s [The Case Against AI Control](https://www.lesswrong.com/posts/8wBN8cdNAv3c7vt6p/the-case-against-ai-control-research).

Here’s an illustrative example. People right now are researching dangerous viruses, in a way that poses a risk of catastrophic lab leaks [wildly out of proportion to any benefits](https://80000hours.org/podcast/episodes/carl-shulman-common-sense-case-existential-risks/#gain-of-function-research-013422:~:text=Yeah%2C%20so%20I,around%20the%20world.). Why is that happening? Not because everyone is trying to stop it, but they lack the technical competence to execute. Quite the contrary! Powerful institutions like governments are not only allowing it, but are often funding it!

I think when people imagine future AI helping with this specific problem, they’re usually imagining the AI convincing people—say, government officials, or perhaps the researchers themselves—that this activity is unwise. See the problem? If AI is *convincing* people of things, well, powerful AIs will be able to convince people of bad and false things as well as good and true things. So if the AI is exercising its own best judgment in what to convince people of, then we’d better hope that the AI has good judgment! And it’s evidently not deriving that good judgment from human preferences. Human preferences are what got us into this mess! Right?

Remember, the “alignment generalizes farther” argument (§4 above) says that we shouldn’t worry because AI understands human preferences, and those preferences will guide its actions (via RLHF or whatever). But if we *want* an AI that questions human preferences rather than slavishly following them, then that argument would not be applicable! So how are we hoping to ground the AI’s motivations? It has to be something more like [“ambitious value learning”](https://www.lesswrong.com/posts/SvuLhtREMy8wRBzpC/ambitious-vs-narrow-value-learning) or [Coherent Extrapolated Volition](https://www.lesswrong.com/tag/coherent-extrapolated-volition)—things that are philosophically fraught, and rather different from what people today are doing with foundation models.

### 5.1.3 The argument that we can and will do better than Ev did

A third way to feel optimistic is to say that we can and will do better than Ev did. Remember, Ev is just a demigod, not omnipotent and omniscient.

In particular, as described in §3.5 above, Ev failed to make humans *explicitly desire* to be at a local optimum of inclusive genetic fitness (IGF). She managed to get decently IGF-maximizing behavior *despite* that failure, but only in the test environment of Pleistocene Africa, and not in a way that’s robust to the endless self-generated distribution shifts of open-ended (1-3) looping.

“Well OK,” says the optimist. “…so much the worse for Ev! She didn’t have interpretability, and she didn’t have intelligent supervision after the training has already been running, etc. But we do! Let’s just engineer the AI’s explicit motivation!”

That gets us to things like “[Plan for mediocre alignment of brain-like \[model-based RL\] AGI](https://www.lesswrong.com/posts/Hi7zurzkCog336EC2/plan-for-mediocre-alignment-of-brain-like-model-based-rl-agi)” (in a model-based RL AGI scenario), or [“Alignment by default”](https://www.lesswrong.com/posts/Nwgdq6kHke5LY692J/alignment-by-default) (in a foundation model scenario).

I will make the *very mildly optimistic* claim that such ideas are not completely certain to cause human extinction. I’m hesitant to say anything much stronger. Neither of these is a proposal for corrigibility—remember from §5.1.2 just above, I don’t think corrigible AIs are enough to get us into a good post-AGI future. (And in the model-based RL scenario, corrigibility has an additional technical challenge; search for the phrase “the first-person problem” [at that link](https://www.lesswrong.com/posts/Hi7zurzkCog336EC2/plan-for-mediocre-alignment-of-brain-like-model-based-rl-agi#3__FAQ).) So the plan really has to work, without course-correcting, through unlimited amounts of the (1-3) loop. That loop will bring on wave after wave of ontological crises, and new options, and new ideas, including via self-reflection. And we don’t have any historical precedent to help us think about how that might go—again, Ev was using very different techniques, as opposed to locking in particular learned concepts as permanent goals. So anyway, for these and other reasons, I lean pessimistic, although who knows.

5.2 A fourth, cop-out option
----------------------------

Alternatively, there’s a cop-out option! If the *outcome* of the (1-3) loop is so hard to predict, we could choose to endorse the *process* while being agnostic about the outcome.

There *is* in fact a precedent for that—indeed, it’s the status quo! We don’t know what the next generation of humans will choose to do, but we’re nevertheless generally happy to entrust the future to them. The problem is the same—the next generation of humans will spin their (1-3) loop, causing self-generated distribution shifts, and ending up going in unpredictable directions. But this is how it’s always been, and we generally feel good about it.

So the idea here is, we could make AIs with social and moral drives that we’re happy about, probably because those drives are human-like in some respects, and then we could *define* “good” as whatever those AIs wind up wanting, upon learning and reflection.

I don’t think this is the default consequence of how people are training their AIs today, but it *is* a possible thing we could try to do. For more on that, see my post [\[Intro to brain-like-AGI safety\] 12. Two paths forward: “Controlled AGI” and “Social-instinct AGI”](https://www.lesswrong.com/posts/Sd4QvG4ZyjynZuHGt/intro-to-brain-like-agi-safety-12-two-paths-forward).

*Thanks Charlie Steiner and Jeremy Gillen for critical comments on earlier drafts.*

**Changelog:**

*Dec 2025:* I replaced “wireheading” with “reward hacking” throughout §3.4.

[^refms0rzyd]: For example: Ramana Kumar, Will Capabilities Generalise More? (2022): nice little summary of some arguments.Jan Kulveit, We don't understand what happened with culture enough (2023): I didn’t get anything out of this, it just confused me, but YMMV.Zvi Mowshowitz, Response to Quintin Pope's Evolution Provides No Evidence For the Sharp Left Turn (2023): I found it more about responding to very specific things, and not so much bringing new positive arguments to the table, which is why I don’t talk about it in this post.Others at the Sharp Left Turn tag. 

[^ug0y8xg37sh]: Update 2025-08: I’m not sure if the term “RLVR” existed when I first wrote this post. Or if it did, I hadn’t heard of it. But now everyone uses that term, so I edited it in. 

[^kp1a7t9eakk]: When groups of humans form a discipline, (2A) plays an additional, complementary role, related to community epistemics. As the saying goes: “all that Science really asks of you [is] the ability to accept reality when you're beat over the head with it.” Basically, some people have more (2B), and they figure out what’s going on on the basis of hints and indirect evidence. Others don’t. The former group can gather ever-more-direct and ever-more-unassailable (2A)-type evidence, and use that evidence as a cudgel with which to beat the latter group over the head until they finally get it. This is an important social tool, and its absence is why bad scientific ideas can die, while bad philosophy ideas live forever. Actually, it’s even worse than that. If the bad philosophy ideas don’t die, then there’s no common knowledge that the bad philosophers are bad, and then they can rise in the ranks and hire other bad philosophers, and the whole culture can gradually shift in bad directions like prizing novelty over correctness. 

[^mk5lbq2uco]: A possible exception is the idea of “pivotal acts”. But few people these days seem to be thinking along those lines, for better or worse.