@producer @docker
Feature: Use Knip plugins without running target settings
  Stage 2 runs Knip 6.44.1 in the pinned tool image, with no network and a
  read-only file system. Every Knip plugin stays turned off, so Knip never loads a
  settings file of the target, because a settings file is a script that could run.
  For each plugin whose package is a dependency in a workspace manifest, the Stage 2
  profile copies the default entry file-name patterns of the plugin from Knip
  6.44.1 into the entry patterns of the workspace. It records the plugin, the
  dependency and the manifest of each copied pattern, and each plugin that it found
  but did not copy, with the reason. Stage 4 collect lists each file that a copied
  pattern selects as a behavior entry candidate, next to the candidates of the
  Choom settings rules. An entry that only a settings file names comes from those
  rules or is a gap.
  The operator runs Stage 2 with Docker, finishes Stage 3 and collects the Stage 4
  source evidence. These scenarios need a Docker engine.

  Scenario: A framework entry found by its file-name pattern
    Given a saved snapshot of a frontend project whose entry file follows the framework's naming pattern
    When the operator runs entry analysis
    Then Knip does not report the entry file as unused
    And the entry is a candidate that names the plugin and the dependency as its source

  Scenario: A settings file is never loaded
    Given a saved snapshot whose framework settings file is a script
    When the operator runs entry analysis
    Then the settings file is not loaded
    And the profile names the framework plugin as found by its dependency but not copied, with the reason
    And an entry named only in that file comes from the settings rules or is a gap
