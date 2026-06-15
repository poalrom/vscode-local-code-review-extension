# Zen of Program Design

The design principles for this repository. Follow it when designing, implementing, and reviewing code.

1. Beautiful is better than ugly.
2. Divide and conquer.
3. Do not multiply entities unnecessarily.
4. Good architecture can only be achieved by giving up some requirements.
5. Fences are for people, not for keeping animals out.
6. The design should be ideal, even if the implementation cannot be.
7. An interface must be implementable.
8. Mutable state, leaky abstractions, and the pursuit of fewer lines of code are the main enemies.
9. Single Responsibility, Liskov Substitution, and Dependency Inversion are the main allies.
10. When choosing between brevity and clarity, choose clarity.
11. Design should begin with use cases. If a use case is hypothetical, it must be highly realistic.
12. Simple is better than complex, but complex is better than complicated.
13. The level of abstraction must be limited.
14. The thought process should be documented. Its outcome even more so.
15. Discussions should proceed slowly, with even the obvious things stated explicitly.
16. Everything is design—from distributed systems architecture to the style of code comments.
17. References—patterns, style guides, cautionary tales, and existing code—should be respected, but treated with skepticism. Are they applicable to your case?
18. When moving from bad design to good design, avoid making large changes.
19. There is a time to gather stones and a time to scatter them. Remember, however, that gathering is harder.
20. When making something only slightly better, consistency is not important.

## Commentaries

### 4. Requirements shape architecture

Architecture is not independent of product requirements. Some requirements make a clean design impossible or disproportionately expensive. Good design often begins with deciding what the system will not support.

### 5. Fences are for people

Interfaces, conventions, type systems, and internal boundaries should help cooperative developers use a system correctly. They should not be mistaken for complete protection against hostile input, misuse, or broken assumptions.

### 6. Ideal design, pragmatic implementation

The conceptual model should remain clear even when deadlines, legacy systems, and limited resources force compromises in the implementation. A temporary shortcut should not become the intended architecture.

### 7. Implementable interfaces

An interface must reflect something that can actually be implemented with reasonable guarantees. An elegant contract is harmful when every implementation must violate it.

### 8. The main enemies

Mutable state increases the number of possible system states. Leaky abstractions force users to understand implementation details. Optimizing for fewer lines of code often hides complexity instead of removing it.

### 11. Design from use cases

A design should be tested against concrete situations rather than abstract possibilities. Hypothetical use cases are useful only when they closely resemble problems that could realistically occur.

### 13. Limited abstractions

Every abstraction should have a clear scope and a limited domain of validity. An abstraction that tries to represent everything usually explains nothing well.

### 14. Record the reasoning

Design decisions lose much of their value when their motivation disappears. Document assumptions, rejected alternatives, and trade-offs—not only the final structure.

### 15. Discuss slowly

Many design disagreements are caused by different unstated assumptions. Saying obvious things explicitly helps reveal where those assumptions diverge.

### 17. Respect references, but remain skeptical

Patterns and style guides capture useful experience, but they were created for particular problems and constraints. Their existence is evidence to consider, not proof that they apply.

### 18. Improve incrementally

Large redesigns combine too many assumptions and make failures difficult to diagnose. Small changes provide feedback and preserve the possibility of retreat.

### 19. Gathering is harder

Removing structure is usually easier than rebuilding it. Deleting documentation, abstractions, checks, or conventions may be quick; restoring the lost knowledge is not.

### 20. Local improvement over global consistency

A small improvement should not require an immediate rewrite of the entire system. Temporary inconsistency can be acceptable when it allows gradual movement toward a better design.