@baseline-viewer @bv-07 @packaged
Feature: Retire repository and diagram write commands
  The installed viewer exposes only the native operations needed to read a baseline.

  Scenario Outline: The installed host rejects a retired command
    Given installed Choom has only a standalone reviewed baseline and no analyzer runtime
    When the installed caller requests the retired command "<command>"
    Then the native host rejects that command before a command handler runs

    Examples:
      | command                   |
      | repository_open           |
      | repository_read_text      |
      | repository_resolve_paths  |
      | repository_close          |
      | depcruiser_prepare        |
      | depcruiser_run            |
      | depcruiser_cancel         |
      | depcruiser_release        |
      | document_snapshot_create  |
      | document_snapshot_read    |
      | document_snapshot_release |
      | document_export           |
      | document_cleanup          |
