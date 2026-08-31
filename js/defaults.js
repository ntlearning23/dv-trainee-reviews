const CATEGORIES = [
  "SystemVerilog Quality",
  "UVM Structure & Architecture",
  "UVM Phases & Objections",
  "Transactions & Sequences",
  "Driver & Monitor",
  "Agent & Environment",
  "Scoreboard & Reference Model",
  "Functional Coverage",
  "Assertions / SVA",
  "Reset Handling",
  "Test Quality & Corner Cases",
  "UVM Reporting & Debugging",
  "Code Reuse & Maintainability",
];

const DEFAULT_CHECKLIST = [
  // SystemVerilog Quality
  { category: "SystemVerilog Quality", text: "Naming is consistent and meaningful (classes, tasks, functions, signals, files)." },
  { category: "SystemVerilog Quality", text: "Virtual interfaces are used correctly and obtained via config_db — not hardcoded." },
  { category: "SystemVerilog Quality", text: "Types are appropriate (logic/bit, enums, packed structs); avoids reg/integer misuse." },
  { category: "SystemVerilog Quality", text: "No unjustified hardcoded delays (#, wait) in reactive TB components." },

  // UVM Structure & Architecture
  { category: "UVM Structure & Architecture", text: "Hierarchy is correct: test → env → agent → driver / monitor / sequencer." },
  { category: "UVM Structure & Architecture", text: "Components are created in build_phase; TLM connections are made in connect_phase." },
  { category: "UVM Structure & Architecture", text: "Factory registration is present (uvm_component_utils / uvm_object_utils)." },
  { category: "UVM Structure & Architecture", text: "Configuration objects and uvm_config_db are used instead of a hardwired topology." },

  // UVM Phases & Objections
  { category: "UVM Phases & Objections", text: "Objections are raised and dropped in matching pairs (typically in the test or top sequence)." },
  { category: "UVM Phases & Objections", text: "Work is in the correct phase — no run-time stimulus in build/connect." },
  { category: "UVM Phases & Objections", text: "Drain time / last-transaction completion is considered so scoreboard checks are not cut off." },
  { category: "UVM Phases & Objections", text: "Reset / bring-up does not race with the first stimulus." },

  // Transactions & Sequences
  { category: "Transactions & Sequences", text: "Sequence item extends uvm_sequence_item with fields, constraints, and print/copy/compare." },
  { category: "Transactions & Sequences", text: "Constraints are legal, solvable, and match the protocol." },
  { category: "Transactions & Sequences", text: "Sequences use start_item/finish_item (or uvm_do*) correctly." },
  { category: "Transactions & Sequences", text: "Sequences are reusable (parameterized) rather than one-off copy-paste tests." },

  // Driver & Monitor
  { category: "Driver & Monitor", text: "Driver pulls items from the sequencer via seq_item_port (get_next_item / item_done)." },
  { category: "Driver & Monitor", text: "Driver drives the DUT only through the virtual interface (clocking block if used)." },
  { category: "Driver & Monitor", text: "Monitor is passive — it never drives the DUT." },
  { category: "Driver & Monitor", text: "Monitor broadcasts observed transactions on an analysis port." },

  // Agent & Environment
  { category: "Agent & Environment", text: "Agent is_active (UVM_ACTIVE / UVM_PASSIVE) controls driver and sequencer creation." },
  { category: "Agent & Environment", text: "Monitor is always instantiated, including in passive agents." },
  { category: "Agent & Environment", text: "Environment instantiates agents, scoreboard, and coverage collector." },
  { category: "Agent & Environment", text: "Analysis ports are connected at env level (monitor → scoreboard / coverage)." },

  // Scoreboard & Reference Model
  { category: "Scoreboard & Reference Model", text: "Scoreboard receives transactions via analysis imports / FIFOs — not by poking the driver." },
  { category: "Scoreboard & Reference Model", text: "Reference model is independent of the DUT (does not peek internal DUT state unless justified)." },
  { category: "Scoreboard & Reference Model", text: "Mismatches are reported with uvm_error and enough transaction context to debug." },
  { category: "Scoreboard & Reference Model", text: "End-of-test checks leftover expected/actual queues — no silent unmatched items." },

  // Functional Coverage
  { category: "Functional Coverage", text: "Covergroups capture the features and scenarios that matter for this module." },
  { category: "Functional Coverage", text: "Sampling is at the right time (typically a monitor/subscriber), not an arbitrary clock edge." },
  { category: "Functional Coverage", text: "Bins / ignore / illegal bins are useful — not a single catch-all bin." },
  { category: "Functional Coverage", text: "Coverage lives in a collector/subscriber, not jammed into the driver." },

  // Assertions / SVA
  { category: "Assertions / SVA", text: "Protocol or interface assertions exist for handshake, timing, or stability." },
  { category: "Assertions / SVA", text: "Assertions are disabled or gated during reset and initialization." },
  { category: "Assertions / SVA", text: "Assertion failures are labeled and specific enough to debug." },
  { category: "Assertions / SVA", text: "SVA is in the interface or a bound module — not duplicated inside the UVM driver." },

  // Reset Handling
  { category: "Reset Handling", text: "A reset sequence or test-level reset is applied before stimulus." },
  { category: "Reset Handling", text: "Driver and monitor do not send or compare transactions while reset is asserted." },
  { category: "Reset Handling", text: "Scoreboard queues and reference state are cleared on reset." },
  { category: "Reset Handling", text: "Mid-test reset (if required) does not leave the testbench hung." },

  // Test Quality & Corner Cases
  { category: "Test Quality & Corner Cases", text: "Tests are self-checking (scoreboard / assertions) — not waveform inspection." },
  { category: "Test Quality & Corner Cases", text: "Base test vs directed tests are structured; test selection is clear." },
  { category: "Test Quality & Corner Cases", text: "Corner cases exist: back-to-back, idle gaps, min/max fields, boundary values." },
  { category: "Test Quality & Corner Cases", text: "Tests are reproducible (seed / plusargs documented)." },

  // UVM Reporting & Debugging
  { category: "UVM Reporting & Debugging", text: "uvm_info / warning / error / fatal are used with correct severity and a stable ID." },
  { category: "UVM Reporting & Debugging", text: "Default verbosity is readable; extra debug is available when needed." },
  { category: "UVM Reporting & Debugging", text: "Transactions can be printed (convert2string or field macros) for debug." },
  { category: "UVM Reporting & Debugging", text: "Failures include enough context (time, IDs, values) to debug without a GUI." },

  // Code Reuse & Maintainability
  { category: "Code Reuse & Maintainability", text: "Shared types, sequences, and utilities live in packages — not copied per test." },
  { category: "Code Reuse & Maintainability", text: "File and directory layout matches UVM convention and is easy to navigate." },
  { category: "Code Reuse & Maintainability", text: "Magic numbers are replaced by parameters, enums, or config." },
  { category: "Code Reuse & Maintainability", text: "How to compile and run a test is documented (script + example command)." },
];

const DEFAULT_QUESTIONS = [
  { question: "Explain the UVM testbench architecture in your project.", topic: "Architecture" },
  { question: "Why did you use uvm_config_db?", topic: "Configuration" },
  { question: "Explain the flow from sequence → sequencer → driver.", topic: "Sequences" },
  { question: "Why is the monitor passive?", topic: "Monitor" },
  { question: "How does the scoreboard know the expected result?", topic: "Scoreboard" },
  { question: "Why do we use the UVM factory?", topic: "Factory" },
  { question: "Explain your reset handling.", topic: "Reset" },
  { question: "What happens if randomize() fails?", topic: "Constraints" },
  { question: "How would you improve your testbench?", topic: "Quality" },
  { question: "Explain one bug you found and how you debugged it.", topic: "Debugging" },
];

const STATUS_OPTIONS = [
  { value: "not_reviewed", label: "Not Reviewed" },
  { value: "pass", label: "Pass" },
  { value: "needs_improvement", label: "Needs Improvement" },
  { value: "fail", label: "Fail" },
  { value: "pending", label: "Pending" },
  { value: "na", label: "N/A" },
];

const RECOMMENDATIONS = [
  { value: "", label: "Not set" },
  { value: "ready", label: "Ready for Next Topic" },
  { value: "needs_improvement", label: "Needs Improvement" },
  { value: "re_review", label: "Re-review Required" },
];
