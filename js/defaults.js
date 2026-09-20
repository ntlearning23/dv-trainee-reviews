const CATEGORIES = [
  "SystemVerilog Quality",
  "UVM Structure & Architecture",
  "UVM Phases & Objections",
  "Transactions & Sequences",
  "Driver",
  "Monitor",
  "Agent & Environment",
  "Scoreboard & Reference Model",
  "Functional Coverage",
  "Assertions / SVA",
  "Reset Handling",
  "Test Quality & Corner Cases",
  "UVM Reporting & Debugging",
  "Code Reuse & Maintainability",
  "Bonus — Non-scoring",
];

const SECTION_PREFIXES = {
  "SystemVerilog Quality": "SV",
  "UVM Structure & Architecture": "UVM",
  "UVM Phases & Objections": "PH",
  "Transactions & Sequences": "TX",
  Driver: "DRV",
  Monitor: "MON",
  "Driver & Monitor": "DRV",
  "Agent & Environment": "ENV",
  "Scoreboard & Reference Model": "SB",
  "Functional Coverage": "COV",
  "Assertions / SVA": "SVA",
  "Reset Handling": "RST",
  "Test Quality & Corner Cases": "TST",
  "UVM Reporting & Debugging": "RPT",
  "Code Reuse & Maintainability": "MNT",
  "Bonus — Non-scoring": "B",
  "Bonus - Non-scoring": "B",
};

function fileNote(file, note) {
  return { file, note };
}

const DEFAULT_CHECKLIST = [
  {
    category: "SystemVerilog Quality",
    text: "Naming is consistent and meaningful (classes, tasks, functions, signals, files).",
    files: [
      fileNote("*_pkg.sv", "Package, class, type, and constant names use a consistent prefix and match the DUT or protocol — not my_pkg / foo."),
      fileNote("*_agent.sv, *_driver.sv, *_monitor.sv, *_seq_item.sv", "File names match the class names they contain. No generic names like my_driver.sv."),
      fileNote("*_if.sv", "Interface and signal names match the spec. Avoid one-letter nets except loop indices."),
    ],
  },
  {
    category: "SystemVerilog Quality",
    text: "Virtual interfaces are used correctly and obtained via config_db — not hardcoded.",
    files: [
      fileNote("tb_top.sv / *_test.sv", "Sets the virtual interface into uvm_config_db with a matching type, path, and field name."),
      fileNote("*_driver.sv", "Gets vif in build_phase via uvm_config_db::get. No hierarchical DUT path such as tb.dut.if."),
      fileNote("*_monitor.sv", "Same config_db get as the driver. Fail the build if the vif is missing."),
    ],
  },
  {
    category: "SystemVerilog Quality",
    text: "Types are appropriate (logic/bit, enums, packed structs); avoids reg/integer misuse.",
    files: [
      fileNote("*_seq_item.sv / *_pkg.sv", "Protocol fields are logic, bit, enum, or packed struct. No reg or integer for bus fields."),
      fileNote("*_if.sv", "Port and clocking-block types match the DUT. 4-state logic where X/Z matter."),
    ],
  },
  {
    category: "SystemVerilog Quality",
    text: "No unjustified hardcoded delays (#, wait) in reactive TB components.",
    files: [
      fileNote("*_driver.sv", "No #delay or wait() used to fake timing. Synchronize on clocking block, vif clock, or reset."),
      fileNote("*_monitor.sv", "Samples on a clocking block or clock event — not #1 / #10."),
      fileNote("*_seq.sv", "Item spacing uses protocol idle or handshake, not hardcoded delays, unless justified."),
    ],
  },
  {
    category: "UVM Structure & Architecture",
    text: "Hierarchy is correct: test → env → agent → driver / monitor / sequencer.",
    files: [
      fileNote("*_test.sv", "Creates the environment in build_phase with type_id::create. Does not new() agents itself."),
      fileNote("*_env.sv", "Creates agents, scoreboard, and coverage collector — not the driver directly."),
      fileNote("*_agent.sv", "Creates sequencer, driver, and/or monitor. Driver is not created in the test."),
    ],
  },
  {
    category: "UVM Structure & Architecture",
    text: "Components are created in build_phase; TLM connections are made in connect_phase.",
    files: [
      fileNote("*_env.sv", "create() in build_phase. monitor.ap.connect(...) only in connect_phase."),
      fileNote("*_agent.sv", "Driver seq_item_port.connect(sequencer.seq_item_export) in connect_phase, not build."),
      fileNote("*_scoreboard.sv / *_coverage.sv", "Analysis exports/FIFOs exist so env can connect them in connect_phase."),
    ],
  },
  {
    category: "UVM Structure & Architecture",
    text: "Factory registration is present (uvm_component_utils / uvm_object_utils).",
    files: [
      fileNote("*_test.sv, *_env.sv, *_agent.sv, *_driver.sv, *_monitor.sv", "`uvm_component_utils and type_id::create. No bare new() for components."),
      fileNote("*_seq_item.sv, *_seq.sv, *_cfg.sv", "`uvm_object_utils (and field macros if used). Sequence items must be factory-registered."),
    ],
  },
  {
    category: "UVM Structure & Architecture",
    text: "Configuration objects and uvm_config_db are used instead of a hardwired topology.",
    files: [
      fileNote("*_cfg.sv", "Holds is_active, vif, and protocol knobs. Passed into agent/env rather than hardcoded."),
      fileNote("*_test.sv", "Creates/sets the config object and virtual interface via uvm_config_db before env build."),
      fileNote("*_agent.sv", "Reads config in build_phase. No absolute hierarchical paths to the DUT."),
    ],
  },
  {
    category: "UVM Phases & Objections",
    text: "Objections are raised and dropped in matching pairs (typically in the test or top sequence).",
    files: [
      fileNote("*_test.sv", "Raises and drops objection around the top sequence, or documents that the sequence does it."),
      fileNote("*_seq.sv (top/virtual sequence)", "If objections live here, raise before body work and drop after — matching pairs, no extras in driver."),
      fileNote("*_driver.sv", "Should not raise/drop objections per item. That hides hangs and races."),
    ],
  },
  {
    category: "UVM Phases & Objections",
    text: "Work is in the correct phase — no run-time stimulus in build/connect.",
    files: [
      fileNote("*_driver.sv / *_monitor.sv", "Forever drive/sample loops are in run_phase (or a runtime phase), not build/connect."),
      fileNote("*_test.sv / *_seq.sv", "start() of sequences is in run_phase. build_phase only creates components and config."),
      fileNote("*_env.sv / *_agent.sv", "build_phase = create; connect_phase = TLM; no pin wiggles."),
    ],
  },
  {
    category: "UVM Phases & Objections",
    text: "Drain time / last-transaction completion is considered so scoreboard checks are not cut off.",
    files: [
      fileNote("*_test.sv", "Sets drain_time or waits for last item/objection so the scoreboard can finish."),
      fileNote("*_scoreboard.sv", "Uses check_phase / extract_phase (or equivalent wait) so leftover compares are not skipped."),
      fileNote("*_seq.sv", "Last item is fully finished (item_done / response) before dropping the objection."),
    ],
  },
  {
    category: "UVM Phases & Objections",
    text: "Reset / bring-up does not race with the first stimulus.",
    files: [
      fileNote("*_reset_seq.sv / *_test.sv", "Reset is applied and released before the first start_item of functional sequences."),
      fileNote("*_driver.sv", "Waits for reset deassert before driving the first transfer."),
      fileNote("*_monitor.sv", "Does not publish transactions sampled while reset is asserted."),
    ],
  },
  {
    category: "Transactions & Sequences",
    text: "Sequence item extends uvm_sequence_item with fields, constraints, and print/copy/compare.",
    files: [
      fileNote("*_seq_item.sv", "Extends uvm_sequence_item. Fields registered with utils macros or do_copy/do_compare/convert2string."),
      fileNote("*_pkg.sv", "Item type is exported from the package so sequences and scoreboard share one definition."),
    ],
  },
  {
    category: "Transactions & Sequences",
    text: "Constraints are legal, solvable, and match the protocol.",
    files: [
      fileNote("*_seq_item.sv", "Constraint blocks match legal protocol values. No empty domain or obvious conflicts."),
      fileNote("*_seq.sv", "randomize() / uvm_do_with return value is checked. with-clauses do not fight the item constraints."),
    ],
  },
  {
    category: "Transactions & Sequences",
    text: "Sequences use start_item/finish_item (or uvm_do*) correctly.",
    files: [
      fileNote("*_seq.sv", "Uses start_item/finish_item or uvm_do / uvm_do_with. Does not new() an item and poke the driver."),
      fileNote("*_driver.sv", "Completes the handshake with get_next_item / item_done (or try_next_item if justified)."),
    ],
  },
  {
    category: "Transactions & Sequences",
    text: "Sequences are reusable (parameterized) rather than one-off copy-paste tests.",
    files: [
      fileNote("*_seq.sv / seq library", "Knobs (count, delays, addr ranges) are fields or constructor args — not a unique copied class per test."),
      fileNote("*_test.sv", "Selects or overrides sequences instead of pasting the same body into every test."),
    ],
  },
  {
    category: "Driver",
    text: "Driver pulls items from the sequencer via seq_item_port (get_next_item / item_done).",
    files: [
      fileNote("*_driver.sv", "run_phase forever loop: seq_item_port.get_next_item(req), drive, then item_done(). No mailbox from the test."),
      fileNote("*_agent.sv", "connect_phase ties driver.seq_item_port to sequencer.seq_item_export."),
    ],
  },
  {
    category: "Driver",
    text: "Driver drives the DUT only through the virtual interface (clocking block if used).",
    files: [
      fileNote("*_driver.sv", "Assignments go through vif / clocking block only. No hierarchical DUT force or peek."),
      fileNote("*_if.sv", "Clocking block (if present) is what the driver uses. Directions match driver vs monitor."),
    ],
  },
  {
    category: "Monitor",
    text: "Monitor is passive — it never drives the DUT.",
    files: [
      fileNote("*_monitor.sv", "Only samples vif inputs / clocking. No vif.sig <= assignments or drive tasks."),
      fileNote("*_if.sv", "Monitor clocking block is input-only for DUT-driven signals."),
    ],
  },
  {
    category: "Monitor",
    text: "Monitor broadcasts observed transactions on an analysis port.",
    files: [
      fileNote("*_monitor.sv", "Declares uvm_analysis_port, builds the observed item, and calls ap.write(tr) once per transaction."),
      fileNote("*_seq_item.sv", "Observed item has the fields the scoreboard and coverage need (addr, data, kind, etc.)."),
    ],
  },
  {
    category: "Agent & Environment",
    text: "Agent is_active (UVM_ACTIVE / UVM_PASSIVE) controls driver and sequencer creation.",
    files: [
      fileNote("*_agent.sv", "If UVM_ACTIVE: create driver and sequencer and connect them. If UVM_PASSIVE: skip both."),
      fileNote("*_cfg.sv / *_test.sv", "is_active is set from config, not hardcoded true in the agent."),
    ],
  },
  {
    category: "Agent & Environment",
    text: "Monitor is always instantiated, including in passive agents.",
    files: [
      fileNote("*_agent.sv", "Monitor is created in build_phase regardless of is_active. Passive agents still observe."),
    ],
  },
  {
    category: "Agent & Environment",
    text: "Environment instantiates agents, scoreboard, and coverage collector.",
    files: [
      fileNote("*_env.sv", "Creates the agent(s), scoreboard, and coverage collector in build_phase via the factory."),
      fileNote("*_test.sv", "Creates only the env (plus any virtual sequencer). Does not new() the scoreboard in the test."),
    ],
  },
  {
    category: "Agent & Environment",
    text: "Analysis ports are connected at env level (monitor → scoreboard / coverage).",
    files: [
      fileNote("*_env.sv", "connect_phase: agent.monitor.ap.connect(scoreboard.imp) and coverage subscriber."),
      fileNote("*_scoreboard.sv / *_coverage.sv", "Exposes analysis_imp, analysis_export, or tlm_analysis_fifo for that connection."),
    ],
  },
  {
    category: "Scoreboard & Reference Model",
    text: "Scoreboard receives transactions via analysis imports / FIFOs — not by poking the driver.",
    files: [
      fileNote("*_scoreboard.sv", "Uses analysis_imp or tlm_analysis_fifo write/get. No hierarchical handle to the driver."),
      fileNote("*_env.sv", "Only connection is monitor analysis port → scoreboard. Driver is not a producer."),
    ],
  },
  {
    category: "Scoreboard & Reference Model",
    text: "Reference model is independent of the DUT (does not peek internal DUT state unless justified).",
    files: [
      fileNote("*_scoreboard.sv / *_ref_model.sv", "Predicts from input transactions or a golden function. No tb.dut.internal peeks unless a written white-box exception."),
    ],
  },
  {
    category: "Scoreboard & Reference Model",
    text: "Mismatches are reported with uvm_error and enough transaction context to debug.",
    files: [
      fileNote("*_scoreboard.sv", "On mismatch: uvm_error with time, expected vs actual, and item printout (convert2string or `uvm_field)."),
      fileNote("*_seq_item.sv", "Print/compare is complete enough that the error message is readable without a waveform."),
    ],
  },
  {
    category: "Scoreboard & Reference Model",
    text: "End-of-test checks leftover expected/actual queues — no silent unmatched items.",
    files: [
      fileNote("*_scoreboard.sv", "check_phase / report_phase flags leftover expected or actual entries with uvm_error. Queues must not just drain silently."),
    ],
  },
  {
    category: "Functional Coverage",
    text: "Covergroups capture the features and scenarios that matter for this module.",
    files: [
      fileNote("*_coverage.sv / *_subscriber.sv", "Coverpoints map to real features (commands, delays, corners), not a leftover tutorial example."),
      fileNote("spec / README (if present)", "Coverage intent matches the module’s must-verify list."),
    ],
  },
  {
    category: "Functional Coverage",
    text: "Sampling is at the right time (typically a monitor/subscriber), not an arbitrary clock edge.",
    files: [
      fileNote("*_coverage.sv", "sample() is called from write() of the analysis port (transaction complete), not always @(posedge clk)."),
      fileNote("*_monitor.sv", "Writes the item only when the transfer is complete so coverage sees a finished transaction."),
    ],
  },
  {
    category: "Functional Coverage",
    text: "Bins / ignore / illegal bins are useful — not a single catch-all bin.",
    files: [
      fileNote("*_coverage.sv", "Explicit bins for interesting values. ignore_bins / illegal_bins where the protocol forbids values."),
    ],
  },
  {
    category: "Functional Coverage",
    text: "Coverage lives in a collector/subscriber, not jammed into the driver.",
    files: [
      fileNote("*_coverage.sv", "Separate subscriber/collector component with a covergroup."),
      fileNote("*_driver.sv", "No covergroup or coverpoint here. Driver should only drive."),
    ],
  },
  {
    category: "Assertions / SVA",
    text: "Protocol or interface assertions exist for handshake, timing, or stability.",
    files: [
      fileNote("*_if.sv / *_sva.sv", "Properties for handshake (valid/ready), timing, or stability. Not an empty interface."),
    ],
  },
  {
    category: "Assertions / SVA",
    text: "Assertions are disabled or gated during reset and initialization.",
    files: [
      fileNote("*_if.sv / *_sva.sv", "disable iff (reset) or equivalent gate. Assertions must not fire through reset X/transition."),
    ],
  },
  {
    category: "Assertions / SVA",
    text: "Assertion failures are labeled and specific enough to debug.",
    files: [
      fileNote("*_if.sv / *_sva.sv", "Named properties/assertions with unique labels. Fail message names the handshake or timing rule."),
    ],
  },
  {
    category: "Assertions / SVA",
    text: "SVA is in the interface or a bound module — not duplicated inside the UVM driver.",
    files: [
      fileNote("*_if.sv / bind module", "Assertions live here (or a bound checker)."),
      fileNote("*_driver.sv", "No immediate/concurrent assertions that duplicate the protocol checker."),
    ],
  },
  {
    category: "Reset Handling",
    text: "A reset sequence or test-level reset is applied before stimulus.",
    files: [
      fileNote("*_reset_seq.sv / *_test.sv", "Reset is asserted then released before functional sequences start."),
      fileNote("*_if.sv", "Reset pin is driven from the TB (sequence or top), not left floating."),
    ],
  },
  {
    category: "Reset Handling",
    text: "Driver and monitor do not send or compare transactions while reset is asserted.",
    files: [
      fileNote("*_driver.sv", "Waits for reset deassert; does not drive protocol while reset is on."),
      fileNote("*_monitor.sv", "Drops or never writes items sampled during reset."),
    ],
  },
  {
    category: "Reset Handling",
    text: "Scoreboard queues and reference state are cleared on reset.",
    files: [
      fileNote("*_scoreboard.sv", "Reset path or flush clears expected/actual queues and reference state. No stale compares after reset."),
    ],
  },
  {
    category: "Reset Handling",
    text: "Mid-test reset (if required) does not leave the testbench hung.",
    files: [
      fileNote("*_test.sv / *_reset_seq.sv", "If mid-test reset exists: objections, sequences, and FIFOs recover so the test can continue."),
      fileNote("*_driver.sv / *_scoreboard.sv", "In-flight items are dropped or completed; no forever wait on a pre-reset handshake."),
    ],
  },
  {
    category: "Test Quality & Corner Cases",
    text: "Tests are self-checking (scoreboard / assertions) — not waveform inspection.",
    files: [
      fileNote("*_test.sv", "Pass/fail comes from UVM errors (scoreboard/SVA), not a comment to check the waveform."),
      fileNote("*_scoreboard.sv / *_sva.sv", "At least one real check exists for the scenario the test claims to cover."),
    ],
  },
  {
    category: "Test Quality & Corner Cases",
    text: "Base test vs directed tests are structured; test selection is clear.",
    files: [
      fileNote("*_base_test.sv", "Common build/config lives here. Directed tests extend it."),
      fileNote("*_test.sv / run script", "Test name / plusarg / factory override selects the test. No commented-out swaps in one file."),
    ],
  },
  {
    category: "Test Quality & Corner Cases",
    text: "Corner cases exist: back-to-back, idle gaps, min/max fields, boundary values.",
    files: [
      fileNote("*_seq.sv / seq library", "Sequences (or knobs) for back-to-back, idle gaps, min/max fields, and boundary values — not only the happy path."),
      fileNote("*_test.sv", "At least one directed or constrained test hits a corner, not only a single smoke sequence."),
    ],
  },
  {
    category: "Test Quality & Corner Cases",
    text: "Tests are reproducible (seed / plusargs documented).",
    files: [
      fileNote("README / Makefile / run.sh", "Example command includes test name and seed or plusargs."),
      fileNote("*_test.sv", "Config knobs that change behavior are plusargs or documented factory overrides."),
    ],
  },
  {
    category: "UVM Reporting & Debugging",
    text: "uvm_info / warning / error / fatal are used with correct severity and a stable ID.",
    files: [
      fileNote("*_driver.sv, *_monitor.sv, *_scoreboard.sv", "Uses uvm_info/warning/error/fatal with a stable ID (DRV/MON/SB). No $display for real checks."),
    ],
  },
  {
    category: "UVM Reporting & Debugging",
    text: "Default verbosity is readable; extra debug is available when needed.",
    files: [
      fileNote("*_driver.sv / *_monitor.sv", "Routine messages at UVM_MEDIUM/LOW. Cycle-by-cycle dumps at UVM_HIGH/DEBUG."),
    ],
  },
  {
    category: "UVM Reporting & Debugging",
    text: "Transactions can be printed (convert2string or field macros) for debug.",
    files: [
      fileNote("*_seq_item.sv", "convert2string or `uvm_field_* so items print in the log. Empty class with only random fields is a fail."),
    ],
  },
  {
    category: "UVM Reporting & Debugging",
    text: "Failures include enough context (time, IDs, values) to debug without a GUI.",
    files: [
      fileNote("*_scoreboard.sv", "Error includes time, IDs, and expected vs actual values."),
      fileNote("*_driver.sv", "Protocol/timeout fatals name the state and the item being driven."),
    ],
  },
  {
    category: "Code Reuse & Maintainability",
    text: "Shared types, sequences, and utilities live in packages — not copied per test.",
    files: [
      fileNote("*_pkg.sv", "Exports seq_item, sequences, agent types. Tests import the package instead of including class files."),
      fileNote("*_test.sv", "No duplicated transaction class or copy-pasted sequence body."),
    ],
  },
  {
    category: "Code Reuse & Maintainability",
    text: "File and directory layout matches UVM convention and is easy to navigate.",
    files: [
      fileNote("repo layout", "Separate files/folders for agent, env, sequences, tests, interface. One class per file is preferred."),
    ],
  },
  {
    category: "Code Reuse & Maintainability",
    text: "Magic numbers are replaced by parameters, enums, or config.",
    files: [
      fileNote("*_driver.sv / *_seq.sv", "Widths, opcodes, and delays come from parameters, enums, or cfg — not unexplained literals."),
      fileNote("*_cfg.sv / *_pkg.sv", "Shared constants live here so tests and the driver cannot drift."),
    ],
  },
  {
    category: "Code Reuse & Maintainability",
    text: "How to compile and run a test is documented (script + example command).",
    files: [
      fileNote("README.md", "Compile and run steps with an example command (test name, seed)."),
      fileNote("Makefile / run.sh / .f file list", "A script or file list actually compiles the TB. Docs must match the script."),
    ],
  },
];

const DEFAULT_INFO_BY_TEXT = {
  "Naming is consistent and meaningful (classes, tasks, functions, signals, files).":
    "Pass when class, file, type, and signal names share a clear prefix and match the DUT or protocol. Fail generic names (my_driver, foo, tmp) or a file whose name does not match the class it contains.",
  "Virtual interfaces are used correctly and obtained via config_db — not hardcoded.":
    "Pass when the top/test sets the virtual interface in uvm_config_db and driver/monitor get it in build_phase. Fail hierarchical DUT paths such as tb.dut.if, or a silent null vif.",
  "Types are appropriate (logic/bit, enums, packed structs); avoids reg/integer misuse.":
    "Pass when protocol fields use logic, bit, enum, or packed struct. Fail reg or integer for bus fields, or types that cannot represent X/Z where the protocol needs them.",
  "No unjustified hardcoded delays (#, wait) in reactive TB components.":
    "Pass when driver and monitor wait on a clocking block, clock, or reset — not #10 / wait() to fake timing. A justified protocol idle delay in a sequence is acceptable if it is commented.",
  "Hierarchy is correct: test → env → agent → driver / monitor / sequencer.":
    "Pass when the test creates the env, the env creates agents/scoreboard/coverage, and the agent creates driver/monitor/sequencer. Fail a test that news the driver, or an env that skips the agent.",
  "Components are created in build_phase; TLM connections are made in connect_phase.":
    "Pass when type_id::create lives in build_phase and port.connect lives in connect_phase. Fail TLM connects in build, or component creation in run_phase.",
  "Factory registration is present (uvm_component_utils / uvm_object_utils).":
    "Pass when every component/object is registered and created with type_id::create. Fail bare new() for UVM components, or a sequence item with no uvm_object_utils.",
  "Configuration objects and uvm_config_db are used instead of a hardwired topology.":
    "Pass when is_active, vif, and knobs come from a config object / config_db. Fail absolute hierarchical paths or constants baked into the agent.",
  "Objections are raised and dropped in matching pairs (typically in the test or top sequence).":
    "Pass when one place (test or top sequence) raises and drops in a matching pair around stimulus. Fail objections inside the driver per item, or a raise with no drop.",
  "Work is in the correct phase — no run-time stimulus in build/connect.":
    "Pass when build/connect only create and wire the topology, and stimulus/sample loops run in run_phase. Fail pin wiggles or sequence start() in build_phase.",
  "Drain time / last-transaction completion is considered so scoreboard checks are not cut off.":
    "Pass when the last item can finish and the scoreboard still has time to compare (drain_time, check_phase, or an explicit wait). Fail dropping the objection the instant the sequence body ends.",
  "Reset / bring-up does not race with the first stimulus.":
    "Pass when reset is applied and released before the first start_item, and the driver waits for deassert. Fail the first transfer overlapping reset.",
  "Sequence item extends uvm_sequence_item with fields, constraints, and print/copy/compare.":
    "Pass when the item extends uvm_sequence_item, carries protocol fields, and can print/copy/compare (macros or do_* / convert2string). Fail a bare class with only rand bits and no print.",
  "Constraints are legal, solvable, and match the protocol.":
    "Pass when constraints match legal protocol values and randomize() is checked. Fail conflicting or empty domains, or ignoring a 0 return from randomize().",
  "Sequences use start_item/finish_item (or uvm_do*) correctly.":
    "Pass when sequences use start_item/finish_item or uvm_do/uvm_do_with. Fail new()+direct driver poke, or skipping item_done on the driver side.",
  "Sequences are reusable (parameterized) rather than one-off copy-paste tests.":
    "Pass when count, delays, and ranges are knobs, and tests select or override sequences. Fail a unique copied sequence class per test with the same body.",
  "Driver pulls items from the sequencer via seq_item_port (get_next_item / item_done).":
    "Pass when run_phase does get_next_item → drive → item_done, and the agent connects seq_item_port to the sequencer. Fail a mailbox from the test or a missing item_done.",
  "Driver drives the DUT only through the virtual interface (clocking block if used).":
    "Pass when every pin assignment goes through vif / clocking block. Fail hierarchical DUT force, peek, or driving the wrong clocking direction.",
  "Monitor is passive — it never drives the DUT.":
    "Pass when the monitor only samples. Fail any vif.sig <= assignment or drive task inside the monitor.",
  "Monitor broadcasts observed transactions on an analysis port.":
    "Pass when the monitor builds a complete item and calls ap.write(tr) once per transaction. Fail a monitor that only $display, or writes half-formed items.",
  "Agent is_active (UVM_ACTIVE / UVM_PASSIVE) controls driver and sequencer creation.":
    "Pass when UVM_ACTIVE creates driver+sequencer and connects them, and UVM_PASSIVE skips both. Fail a hardcoded active agent with no config knob.",
  "Monitor is always instantiated, including in passive agents.":
    "Pass when the monitor is created in build_phase regardless of is_active. Fail `if (is_active) create(monitor)` — passive agents must still observe.",
  "Environment instantiates agents, scoreboard, and coverage collector.":
    "Pass when the env factory-creates agents, scoreboard, and coverage. Fail creating the scoreboard in the test, or an env that is only an agent wrapper with no checks.",
  "Analysis ports are connected at env level (monitor → scoreboard / coverage).":
    "Pass when env connect_phase ties monitor.ap to scoreboard and coverage. Fail a scoreboard that reaches into the agent, or an unconnected analysis port.",
  "Scoreboard receives transactions via analysis imports / FIFOs — not by poking the driver.":
    "Pass when the scoreboard uses analysis_imp or tlm_analysis_fifo. Fail hierarchical handles to the driver or peeking driven items.",
  "Reference model is independent of the DUT (does not peek internal DUT state unless justified).":
    "Pass when expected values come from input transactions or a golden function. Fail tb.dut.internal peeks unless there is a written white-box exception.",
  "Mismatches are reported with uvm_error and enough transaction context to debug.":
    "Pass when a mismatch is uvm_error with time, expected vs actual, and a printed item. Fail a lone 'MISMATCH' string or $display.",
  "End-of-test checks leftover expected/actual queues — no silent unmatched items.":
    "Pass when check_phase / report_phase flags leftover queue entries. Fail queues that simply go out of scope at the end of test.",
  "Covergroups capture the features and scenarios that matter for this module.":
    "Pass when coverpoints map to real features (commands, delays, corners). Fail a leftover tutorial covergroup that does not match this DUT.",
  "Sampling is at the right time (typically a monitor/subscriber), not an arbitrary clock edge.":
    "Pass when sample() runs from the analysis write of a completed transaction. Fail always @(posedge clk) sampling of a half-updated item.",
  "Bins / ignore / illegal bins are useful — not a single catch-all bin.":
    "Pass when interesting values have explicit bins, and illegal/ignore bins match the protocol. Fail one automatic bin that hides holes.",
  "Coverage lives in a collector/subscriber, not jammed into the driver.":
    "Pass when a separate subscriber owns the covergroup. Fail coverpoints inside the driver.",
  "Protocol or interface assertions exist for handshake, timing, or stability.":
    "Pass when the interface or checker has properties for handshake, timing, or stability. Fail an empty interface with no SVA.",
  "Assertions are disabled or gated during reset and initialization.":
    "Pass when assertions use disable iff (reset) or an equivalent gate. Fail assertions that fire through reset X/transition.",
  "Assertion failures are labeled and specific enough to debug.":
    "Pass when properties have unique labels and the fail message names the rule. Fail unnamed assert property (...) with no label.",
  "SVA is in the interface or a bound module — not duplicated inside the UVM driver.":
    "Pass when SVA lives in the interface or a bound checker. Fail concurrent assertions copied into the driver.",
  "A reset sequence or test-level reset is applied before stimulus.":
    "Pass when reset is asserted then released before functional sequences. Fail a floating reset pin or stimulus during reset.",
  "Driver and monitor do not send or compare transactions while reset is asserted.":
    "Pass when the driver waits for deassert and the monitor does not publish reset-time samples. Fail items with reset still high.",
  "Scoreboard queues and reference state are cleared on reset.":
    "Pass when a reset path flushes expected/actual queues and reference state. Fail stale compares after reset using pre-reset items.",
  "Mid-test reset (if required) does not leave the testbench hung.":
    "Pass if mid-test reset exists: objections, FIFOs, and sequences recover. Fail a forever wait on a pre-reset handshake. If mid-test reset is out of scope, mark N/A.",
  "Tests are self-checking (scoreboard / assertions) — not waveform inspection.":
    "Pass when pass/fail comes from UVM errors (scoreboard/SVA). Fail a test whose only check is a comment to look at the waveform.",
  "Base test vs directed tests are structured; test selection is clear.":
    "Pass when common build/config lives in a base test and plusarg/factory selects the directed test. Fail commented-out test swaps in one file.",
  "Corner cases exist: back-to-back, idle gaps, min/max fields, boundary values.":
    "Pass when sequences or tests hit back-to-back, idle, min/max, or boundaries. Fail a single happy-path smoke test as the whole suite.",
  "Tests are reproducible (seed / plusargs documented).":
    "Pass when README or the run script shows test name and seed/plusargs. Fail undocumented knobs that change behavior.",
  "uvm_info / warning / error / fatal are used with correct severity and a stable ID.":
    "Pass when messages use uvm_info/warning/error/fatal with a stable ID (DRV, MON, SB). Fail $display for real checks, or empty IDs.",
  "Default verbosity is readable; extra debug is available when needed.":
    "Pass when routine logs are UVM_MEDIUM/LOW and cycle dumps are UVM_HIGH/DEBUG. Fail flooding the log at the default verbosity.",
  "Transactions can be printed (convert2string or field macros) for debug.":
    "Pass when convert2string or field macros print the item. Fail a class that cannot be printed in the log.",
  "Failures include enough context (time, IDs, values) to debug without a GUI.":
    "Pass when errors include time, IDs, and expected vs actual values. Fail a timeout fatal with no item or state.",
  "Shared types, sequences, and utilities live in packages — not copied per test.":
    "Pass when tests import a package for seq_item/sequences/agent types. Fail a duplicated transaction class inside a test file.",
  "File and directory layout matches UVM convention and is easy to navigate.":
    "Pass when agent, env, sequences, tests, and interface live in clear files/folders, ideally one class per file. Fail a single dump file for the whole TB.",
  "Magic numbers are replaced by parameters, enums, or config.":
    "Pass when widths, opcodes, and delays come from parameters, enums, or cfg. Fail unexplained literals in the driver that can drift from the item.",
  "How to compile and run a test is documented (script + example command).":
    "Pass when README plus a Makefile/run script show a real compile-and-run command. Fail docs that do not match the script, or no script at all.",
};

function defaultInfoForText(text) {
  const key = String(text || "").trim();
  return key && DEFAULT_INFO_BY_TEXT[key] ? DEFAULT_INFO_BY_TEXT[key] : "";
}

const DEFAULT_QUESTIONS = [
  {
    question: "Explain the UVM testbench architecture in your project.",
    topic: "Architecture",
    expectedAnswer:
      "The test is the top UVM component and creates the environment in build_phase. The env creates agents, scoreboard, and coverage collector. An active agent has a sequencer, driver, and monitor; a passive agent keeps the monitor only. Sequences run on the sequencer; the driver converts sequence items into pin wiggles through a virtual interface. The monitor observes the bus and broadcasts transactions to the scoreboard and coverage through analysis ports. Configuration should move through uvm_config_db / config objects, not hardcoded hierarchical paths.",
  },
  {
    question: "Why did you use uvm_config_db?",
    topic: "Configuration",
    expectedAnswer:
      "uvm_config_db passes virtual interfaces and configuration objects down the hierarchy without tying components to a specific test or DUT path. The top/test sets the interface; driver and monitor get it in build_phase with a type, path, and field name. That keeps agents reusable across tests and avoids globals or absolute hierarchical references. A good answer names what was set (vif, is_active, config object) and where it was retrieved.",
  },
  {
    question: "Explain the flow from sequence → sequencer → driver.",
    topic: "Sequences",
    expectedAnswer:
      "The test (or a virtual sequence) starts a sequence on a sequencer. The sequence calls start_item(), which asks the sequencer for a grant. After the item is randomized, finish_item() sends it to the driver. The driver pulls the item with seq_item_port.get_next_item(), drives the interface, then calls item_done(). uvm_do / uvm_do_with macros wrap this handshake. The sequencer only arbitrates; it does not drive pins.",
  },
  {
    question: "Why is the monitor passive?",
    topic: "Monitor",
    expectedAnswer:
      "The monitor must never drive DUT pins. Its job is to sample the interface, assemble transactions, and publish them on an analysis port. Driving from the monitor would fight the driver, hide protocol bugs, and break reuse in UVM_PASSIVE agents or scoreboard-only setups. Checks and coverage should subscribe to the monitor, not to the driver.",
  },
  {
    question: "How does the scoreboard know the expected result?",
    topic: "Scoreboard",
    expectedAnswer:
      "Expected values come from a reference model, predictor, or golden function that is independent of DUT internals. The scoreboard receives actual transactions from monitors (analysis imports / FIFOs), predicts or looks up the expected result, and compares. Mismatches should be uvm_error with enough context (time, item printout). It should not peek internal DUT signals unless that is a justified white-box check, and leftover queue entries should be flagged at end of test.",
  },
  {
    question: "Why do we use the UVM factory?",
    topic: "Factory",
    expectedAnswer:
      "The factory lets a test substitute a type (driver, sequence, sequence item, env) without editing the original class. Components and objects register with uvm_component_utils / uvm_object_utils and are created with type_id::create, not new(). The test sets type or instance overrides before build_phase. A strong answer gives a concrete override from this project, not only the textbook definition.",
  },
  {
    question: "Explain your reset handling.",
    topic: "Reset",
    expectedAnswer:
      "Reset is applied before stimulus, usually from a reset sequence or test-level control of the reset pin. Driver and monitor should not send or compare transactions while reset is asserted. Scoreboard queues and reference state must be cleared. Assertions / SVA should be disabled or gated during reset. If mid-test reset is required, objections, TLM FIFOs, and sequences must recover so the test does not hang.",
  },
  {
    question: "What happens if randomize() fails?",
    topic: "Constraints",
    expectedAnswer:
      "If randomize() returns 0, the solver could not find a solution — conflicting constraints, an empty domain, or a bad with-clause. The return value must be checked; continuing with an unrandomized item is a bug. Typical response is uvm_error/fatal, constraint debug, and fixing or relaxing the constraints. A good answer mentions which item is randomized and what the test does on failure.",
  },
  {
    question: "How would you improve your testbench?",
    topic: "Quality",
    expectedAnswer:
      "Look for gaps in this project, not generic UVM slogans: missing corner-case sequences, a weak or missing reference model, coverage holes, no error/reset injection, copy-paste tests instead of factory overrides, poor messages, or hardcoded delays. Prioritize the change that would catch more bugs or make the next test cheaper to write. Name a specific component and what you would add.",
  },
  {
    question: "Explain one bug you found and how you debugged it.",
    topic: "Debugging",
    expectedAnswer:
      "Walk through a real bug from this lab: the failing check (scoreboard mismatch, hang, X, objection timeout), how it was isolated (UVM ID, transaction print, waveform, phase/objection trace), the root cause, and the fix. A strong answer names the component, the transaction fields involved, and what would prevent the same class of bug next time.",
  },
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

const SECTION_KINDS = [
  { value: "required", label: "Required" },
  { value: "optional", label: "Optional" },
  { value: "bonus", label: "Bonus" },
];

function questionExpectedAnswer(q) {
  const own = String((q && q.expectedAnswer) || "").trim();
  if (own) return own;
  const text = String((q && q.question) || "").trim();
  if (!text) return "";
  const match = DEFAULT_QUESTIONS.find((d) => d.question === text);
  return match ? String(match.expectedAnswer || "").trim() : "";
}

function slugId(prefix, name) {
  return prefix + "-" + String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sectionKindLabel(kind) {
  return (SECTION_KINDS.find((k) => k.value === kind) || SECTION_KINDS[0]).label;
}

function defaultPrefixForName(name) {
  const raw = String(name || "").trim();
  if (SECTION_PREFIXES[raw]) return SECTION_PREFIXES[raw];
  const lower = raw.toLowerCase();
  if (lower.includes("bonus")) return "B";
  if (lower.includes("driver") && lower.includes("monitor")) return "DRV";
  if (/\bmonitor\b/.test(lower) && !/\bdriver\b/.test(lower)) return "MON";
  if (/\bdriver\b/.test(lower)) return "DRV";
  const letters = raw.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  return letters || "SEC";
}

function normalizePrefix(value, fallbackName) {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned || defaultPrefixForName(fallbackName);
}

function formatItemCode(prefix, index) {
  return `${prefix}-${String(index).padStart(2, "0")}`;
}

function isMonitorItemText(text) {
  return /^\s*monitor\b/i.test(String(text || ""));
}

function itemCode(section, items, item) {
  const name = (section && section.name) || "";
  if (name === "Driver & Monitor") {
    const monitor = isMonitorItemText(item.text);
    const group = (items || []).filter((i) => isMonitorItemText(i.text) === monitor);
    const n = Math.max(1, group.findIndex((i) => i.id === item.id) + 1);
    return formatItemCode(monitor ? "MON" : "DRV", n);
  }
  const prefix = normalizePrefix(section && section.prefix, name);
  const n = Math.max(1, (items || []).findIndex((i) => i.id === item.id) + 1);
  return formatItemCode(prefix, n);
}

function splitCombinedDriverMonitor(categories, checklist) {
  const old = (categories || []).find((c) => c.name === "Driver & Monitor");
  if (!old) return { categories: categories || [], checklist: checklist || [], didSplit: false };
  const driverId = slugId("cat", "Driver");
  const monitorId = slugId("cat", "Monitor");
  const nextCats = [];
  for (const cat of categories) {
    if (cat.name !== "Driver & Monitor") {
      nextCats.push(cat);
      continue;
    }
    nextCats.push({ ...cat, id: driverId, name: "Driver", prefix: "DRV" });
    nextCats.push({
      id: monitorId,
      name: "Monitor",
      kind: cat.kind || "required",
      weight: cat.weight,
      prefix: "MON",
    });
  }
  const nextItems = (checklist || []).map((item) => {
    if (item.categoryId !== old.id) return item;
    return { ...item, categoryId: isMonitorItemText(item.text) ? monitorId : driverId };
  });
  return { categories: nextCats, checklist: nextItems, didSplit: true };
}

function withBonusSection(categories) {
  if ((categories || []).some((c) => /bonus/i.test(c.name || ""))) return categories || [];
  return (categories || []).concat([
    {
      id: slugId("cat", "Bonus — Non-scoring"),
      name: "Bonus — Non-scoring",
      kind: "bonus",
      weight: 0,
      prefix: "B",
    },
  ]);
}

function normalizeCheckFile(raw, keepEmpty) {
  if (typeof raw === "string") {
    const file = raw.trim();
    if (!file && !keepEmpty) return null;
    return { id: uidSafe(), file, note: "" };
  }
  const file = String((raw && (raw.file || raw.name || raw.path)) || "").trim();
  const note = String((raw && (raw.note || raw.check || raw.info)) || "").trim();
  if (!keepEmpty && !file && !note) return null;
  return {
    id: (raw && raw.id) || uidSafe(),
    file,
    note,
  };
}

function normalizeCheckFiles(files, keepEmpty) {
  if (!Array.isArray(files)) return [];
  return files.map((f) => normalizeCheckFile(f, keepEmpty)).filter(Boolean);
}

function defaultFilesForText(text) {
  const match = DEFAULT_CHECKLIST.find((d) => d.text === text);
  return normalizeCheckFiles(match && match.files);
}

function itemFiles(item) {
  if (item && Array.isArray(item.files)) return normalizeCheckFiles(item.files, true);
  return defaultFilesForText(item && item.text);
}

function copyItemFiles(item) {
  return itemFiles(item).map((f) => ({
    id: uidSafe(),
    file: f.file,
    note: f.note,
  }));
}

function ensureItemFiles(item) {
  if (!item) return [];
  if (!Array.isArray(item.files)) item.files = defaultFilesForText(item.text);
  item.files.forEach((f) => {
    if (!f.id) f.id = uidSafe();
    if (f.file == null) f.file = "";
    if (f.note == null) f.note = "";
  });
  return item.files;
}

function builtInTemplate() {
  const categories = CATEGORIES.map((name) => ({
    id: slugId("cat", name),
    name,
    kind: name.toLowerCase().includes("bonus") ? "bonus" : "required",
    weight: name.toLowerCase().includes("bonus") ? 0 : 1,
    prefix: defaultPrefixForName(name),
  }));
  const checklist = DEFAULT_CHECKLIST.map((item, i) => ({
    id: slugId("item", item.category) + "-" + i,
    categoryId: slugId("cat", item.category),
    text: item.text,
    info: item.info || defaultInfoForText(item.text),
    files: copyItemFiles(item),
  }));
  return { categories, checklist, updatedAt: "" };
}

function normalizeSection(sec) {
  const kind = ["required", "optional", "bonus"].includes(sec && sec.kind) ? sec.kind : "required";
  const weight = Number(sec && sec.weight);
  const name = String((sec && sec.name) || "").trim() || "Untitled section";
  return {
    id: (sec && sec.id) || slugId("cat", name),
    name,
    kind,
    weight: Number.isFinite(weight) && weight >= 0 ? weight : 1,
    prefix: normalizePrefix(sec && sec.prefix, name),
  };
}

function normalizeTemplate(raw) {
  const fallback = builtInTemplate();
  if (!raw || typeof raw !== "object") return fallback;
  const split = splitCombinedDriverMonitor(
    Array.isArray(raw.categories) ? raw.categories : [],
    Array.isArray(raw.checklist) ? raw.checklist : []
  );
  let rawCats = split.categories.length ? split.categories : fallback.categories;
  if (split.didSplit) rawCats = withBonusSection(rawCats);
  const categories = rawCats.map(normalizeSection);
  const validIds = new Set(categories.map((c) => c.id));
  const checklist = (split.checklist.length ? split.checklist : fallback.checklist)
    .filter((item) => item && validIds.has(item.categoryId) && String(item.text || "").trim())
    .map((item) => {
      const next = {
        id: item.id || uidSafe(),
        categoryId: item.categoryId,
        text: String(item.text || "").trim(),
        info: String(item.info || "").trim() || defaultInfoForText(item.text),
      };
      if (Array.isArray(item.files)) next.files = normalizeCheckFiles(item.files, true);
      else next.files = defaultFilesForText(item.text);
      return next;
    });
  return {
    categories,
    checklist,
    updatedAt: raw.updatedAt || "",
  };
}

function uidSafe() {
  if (typeof uid === "function") return uid();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
