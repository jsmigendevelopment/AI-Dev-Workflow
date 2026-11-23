# Design

Look and feel from `grill`; theme tokens and screens from `wireframes`, approved by the person; schema and API from `pyramid`. Builders follow it, and don't invent their own.

## Look and feel

From the grill, in the person's words where it matters. `wireframes` turns this into tokens; builders use only the tokens.

| | |
|---|---|
| Feel, in three words | |
| Apps or sites they like, and why | |
| Logo, brand colours, fonts (with file paths) | |
| Light, dark or both | |
| Density | |
| Voice of the copy | |
| Avoid | |

**Theme tokens** (filled in by `wireframes`): colours (contrast checked in light and dark), radius, font families, type scale, spacing, motion.

## Schema

```
table_name
  id          
  ...
```

## API contracts

| Route or action | Input | Output | Who may call it |
|---|---|---|---|
|  |  |  |  |

## Screens

Every screen in the main flow, plus the core screen's empty, error and loading states. ASCII is fine. The clickable prototype is `wireframes/index.html`. A change goes back through approval.

### <Screen name>

```
+--------------------------------------+
| header                               |
+--------------------------------------+
|                                      |
|                                      |
+--------------------------------------+
```

- What's on it:
- What each action does:
- Empty, loading and error states:
