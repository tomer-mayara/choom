@baseline-viewer @baseline-readability @br-03 @browser
Feature: Arrange the component overview
  The user can move components without changing the saved architecture.

  Scenario: Move a parent and its contents
    Given the reviewed baseline is open for component movement
    When the user drags Workspace to another position
    Then Workspace and its children move together
    And Native shell keeps its position
    And the saved movement baseline file is unchanged

  Scenario: Grow enclosing groups when a child moves right and down
    Given the reviewed baseline is open for component movement
    When the user moves Architecture model beyond Workspace's right and bottom boundaries
    Then Workspace and Choom contain the moved child
    And the other component positions and recorded parent are unchanged
    And the saved movement baseline file is unchanged

  Scenario: Keep a child below its parent's header
    Given the reviewed baseline is open for component movement
    When the user moves Architecture model beyond Workspace's left and top boundaries
    Then Architecture model stops below the Workspace header and inside its left boundary
    And the enclosing group origins stay fixed

  Scenario: Move a component with the keyboard
    Given the reviewed baseline is open for component movement
    When the user moves Workspace one step right with an arrow key
    Then Workspace and its descendants move ten diagram units to the right
    And keyboard focus remains on Workspace
    And keyboard movement does not open inspection

  Scenario: Leave panel arrow keys alone
    Given the reviewed baseline is open for component movement
    And keyboard focus is on an owned-interface entry in Workspace inspection
    When the user presses an arrow key in the inspection panel
    Then the component geometry is unchanged
    And focus remains on that panel entry

  Scenario: Reach a large header with the keyboard
    Given the reviewed baseline is open for component movement
    And component headers are wider than the zoomed canvas
    When the user reaches Workspace with the keyboard
    Then its name and leading focus edge stay visible at the same zoom

  Scenario: Keep a moved keyboard header visible
    Given the reviewed baseline is open for component movement
    And component headers are wider than the zoomed canvas
    And the user reaches Workspace with the keyboard
    When the user moves Workspace one step right with an arrow key
    Then Workspace and its descendants move ten diagram units to the right
    And its name and leading focus edge stay visible at the same zoom

  Scenario Outline: Restore the whole arrangement when a drag ends without release
    Given the reviewed baseline is open for component movement
    And Native shell inspection is open during a drag that grows Workspace
    When the active movement is cancelled by <cause>
    Then the positions and bounds from before that drag are restored
    And Native shell inspection stays open
    And later movement and release from that drag change nothing

    Examples:
      | cause               |
      | Escape              |
      | window interruption |

  Scenario: Dragging a component does not select it
    Given the reviewed baseline is open for component movement
    And Native shell inspection is open before movement
    When the user drags Workspace to another position
    Then Workspace and its children move together
    And Native shell inspection stays open
    And component dragging keeps the camera unchanged

  Scenario: Pan over unused space inside a component group
    Given the reviewed baseline is open for component movement
    When the user drags unused space inside Workspace
    Then the camera pans while all component geometry stays unchanged

  Scenario Outline: Retain an arrangement during ordinary use
    Given the component overview has a manual arrangement and camera position
    When the arranged overview experiences <event>
    Then its manual component geometry and camera are retained
    And inspection remains available after <event>

    Examples:
      | event                        |
      | another component inspection |
      | panel navigation             |
      | a window resize              |
      | baseline validation failure  |
      | baseline load cancellation   |

  @br-08 @br-08d
  Scenario Outline: Keep the example after an unsuccessful file open
    Given the example has a manual arrangement and open inspection
    When the arranged overview experiences <event>
    Then its manual component geometry and camera are retained
    And the example's component details remain available

    Examples:
      | event                       |
      | baseline validation failure |
      | baseline load cancellation  |

  @br-08 @br-08d
  Scenario: Opening the example again starts a new arrangement
    Given the example has a manual arrangement and open inspection
    When the user closes and reopens the example
    Then the example has its initial geometry and no old inspection

  Scenario Outline: A successful open starts a new view despite reused IDs
    Given the component overview has a manual arrangement and camera position
    When the user opens <file> successfully
    Then the file's prepared geometry and starting camera replace the manual view
    And the old inspection is closed
    And focus stays on the same element outside the replaced view

    Examples:
      | file                             |
      | the same movement baseline       |
      | another baseline with reused IDs |

  Scenario Outline: A prior pointer cycle cannot change a replacement view
    Given a replacement baseline with reused IDs is waiting to finish layout
    And the user has pressed Workspace <stage>
    When the replacement baseline becomes current
    And the old pointer cycle moves and releases
    Then the replacement keeps its prepared geometry and starting camera
    And the old inspection is closed
    And focus is on the replacement baseline heading

    Examples:
      | stage                      |
      | before the drag threshold  |
      | after the drag threshold   |
