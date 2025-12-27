// ✅ Fix 1: make the header NOT transparent and NOT overlap content
// ✅ Fix 2: mobile UX: switch the players table to a stacked “card row” layout on xs

import React, { useMemo, useState, useEffect } from "react";
import {
    Box,
    Container,
    CssBaseline,
    Paper,
    Typography,
    TextField,
    IconButton,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Checkbox,
    Select,
    MenuItem,
    Chip,
    Tooltip,
    Stack,
    Divider,
    Button,
    AppBar,
    Toolbar,
    useMediaQuery, FormControl, InputLabel,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import GitHubIcon from "@mui/icons-material/GitHub";

import {
    ThemeManagerProvider,
    ThemeSelector,
    ThemeEditorModal,
    NewThemeButton,
    allPresets,
} from "@rajrai/mui-theme-manager";

const STORAGE_KEY = "three_way_trade_analyzer.v2";

// ----------------------------
// Upgrader for old saved data
// ----------------------------
function upgradeTeamsSchema(rawTeams) {
    if (!Array.isArray(rawTeams)) return null;
    return rawTeams.map((t) => ({
        ...t,
        players: (t.players || []).map((p) => {
            const senderValue =
                typeof p.senderValue === "number"
                    ? p.senderValue
                    : typeof p.value === "number"
                        ? p.value
                        : 0;
            const receiverValues =
                p.receiverValues && typeof p.receiverValues === "object" ? p.receiverValues : {};
            return {
                id: p.id,
                name: p.name ?? "Player",
                senderValue,
                receiverValues,
                enabled: p.enabled !== false,
                toTeamId: p.toTeamId ?? t.id,
            };
        }),
    }));
}

function loadSavedTeams() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return upgradeTeamsSchema(parsed);
    } catch {
        return null;
    }
}

// ------------------------------------------------------------
// ✅ Themed wrapper (now with proper AppBar)
// ------------------------------------------------------------
export default function ThemedApp() {
    return (
        <ThemeManagerProvider presets={allPresets}>
            <CssBaseline />
            <ThemeEditorModal />

            {/* ✅ Non-transparent, non-overlapping header */}
            <TopBar />

            {/* Wrapped "real app" */}
            <AppCore />
        </ThemeManagerProvider>
    );
}

function TopBar() {
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down("sm"));

    return (
        <AppBar
            position="sticky"
            elevation={0}
            sx={{
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                color: "text.primary",
                backdropFilter: "blur(8px)",
            }}
        >
            <Toolbar sx={{ gap: 1 }}>
                <Typography
                    variant={isXs ? "subtitle1" : "h6"}
                    fontWeight={800}
                    sx={{ flex: 1, minWidth: 0 }}
                    noWrap
                >
                    Multi-Team Trade Analyzer
                </Typography>

                {/* Keep controls, but make them compact on mobile */}
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <ThemeSelector />
                    {!isXs && <NewThemeButton />}

                    <Tooltip title="View on GitHub">
                        <IconButton
                            component="a"
                            href="https://github.com/rajrai/multi-team-trade-analyzer"
                            target="_blank"
                            rel="noopener noreferrer"
                            color="inherit"
                            size={isXs ? "small" : "medium"}
                        >
                            <GitHubIcon fontSize={isXs ? "small" : "medium"} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Toolbar>
        </AppBar>
    );
}

// ------------------------------------------------------------
// App with asymmetric values
// ------------------------------------------------------------
function AppCore() {
    const defaultTeams = [
        {
            id: "A",
            name: "Team A",
            players: [
                {
                    id: "a1",
                    name: "Player A1",
                    senderValue: 32,
                    receiverValues: { B: 35 },
                    enabled: true,
                    toTeamId: "B",
                },
            ],
        },
        {
            id: "B",
            name: "Team B",
            players: [
                {
                    id: "b1",
                    name: "Player B1",
                    senderValue: 27,
                    receiverValues: { A: 31 },
                    enabled: true,
                    toTeamId: "A",
                },
            ],
        },
    ];

    const [teams, setTeams] = useState(() => loadSavedTeams() ?? defaultTeams);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
    }, [teams]);

    const resetAll = () => {
        localStorage.removeItem(STORAGE_KEY);
        setTeams(defaultTeams);
    };

    const addTeam = () => {
        const nextId = suggestTeamId(teams);
        setTeams([...teams, { id: nextId, name: `Team ${nextId}`, players: [] }]);
    };

    const setTeamName = (id, name) =>
        setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));

    const addPlayer = (teamId) => {
        const newId = `${teamId}-${Date.now().toString(36)}`;
        const others = otherTeamIds(teamId, teams);
        setTeams((prev) =>
            prev.map((t) =>
                t.id === teamId
                    ? {
                        ...t,
                        players: [
                            ...t.players,
                            {
                                id: newId,
                                name: "New Player",
                                senderValue: 0,
                                receiverValues: {},
                                enabled: true,
                                toTeamId: others[0] ?? teamId,
                            },
                        ],
                    }
                    : t
            )
        );
    };

    const deletePlayer = (teamId, playerId) =>
        setTeams((prev) =>
            prev.map((t) =>
                t.id === teamId ? { ...t, players: t.players.filter((p) => p.id !== playerId) } : t
            )
        );

    const updatePlayer = (teamId, playerId, mutator) =>
        setTeams((prev) =>
            prev.map((t) => {
                if (t.id !== teamId) return t;
                return {
                    ...t,
                    players: t.players.map((p) => {
                        if (p.id !== playerId) return p;
                        if (typeof mutator === "function") return mutator(p);
                        return { ...p, ...mutator };
                    }),
                };
            })
        );

    const summary = useMemo(() => computeSummary(teams), [teams]);

    return (
        // ✅ mobile padding / spacing that feels normal
        <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
            <Header onReset={resetAll} onAddTeam={addTeam} />

            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: "1fr",
                    alignItems: "stretch",
                }}
            >
                {teams.map((team) => (
                    <Box key={team.id} sx={{ height: "100%", display: "flex" }}>
                        <TeamEditor
                            team={team}
                            allTeams={teams}
                            onSetName={(name) => setTeamName(team.id, name)}
                            onAdd={() => addPlayer(team.id)}
                            onDelete={(pid) => deletePlayer(team.id, pid)}
                            onUpdate={(pid, mut) => updatePlayer(team.id, pid, mut)}
                        />
                    </Box>
                ))}
            </Box>

            <Box mt={3}>
                <SummaryPanel summary={summary} teams={teams} />
            </Box>
        </Container>
    );
}

// ------------------------------------------------------------
// Header (now just actions; title moved to TopBar)
// ------------------------------------------------------------
function Header({ onReset, onAddTeam }) {
    return (
        <Box display="flex" alignItems="center" justifyContent="flex-end" mb={2} gap={1}>
            <Tooltip title="Add another team">
                <IconButton color="primary" onClick={onAddTeam}>
                    <GroupAddRoundedIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Reset to defaults">
                <IconButton onClick={onReset}>
                    <RestartAltRoundedIcon />
                </IconButton>
            </Tooltip>
        </Box>
    );
}

// ------------------------------------------------------------
// Team Editor (✅ table on desktop, ✅ card rows on mobile)
// ------------------------------------------------------------
function TeamEditor({ team, allTeams, onSetName, onAdd, onDelete, onUpdate }) {
    const theme = useTheme();
    const isXs = useMediaQuery(theme.breakpoints.down("sm"));

    const toTeamName = (teamId) => {
        const t = allTeams.find((x) => x.id === teamId);
        return t ? t.name : teamId || "—";
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                p: { xs: 1.25, sm: 2 },
                width: "100%",
                display: "flex",
                flexDirection: "column",
                height: "100%",
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} gap={1}>
                <TextField
                    label="Team name"
                    value={team.name}
                    onChange={(e) => onSetName(e.target.value)}
                    size="small"
                    inputProps={{ maxLength: 32 }}
                    sx={{ flex: 1, minWidth: 0 }}
                />
                <Tooltip title="Add player">
                    <IconButton color="primary" onClick={onAdd}>
                        <AddRoundedIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* ✅ Mobile layout */}
            {isXs ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {team.players.map((p) => {
                        const destId = p.toTeamId;
                        const currentTheyVal =
                            (p.receiverValues && typeof p.receiverValues[destId] === "number"
                                ? p.receiverValues[destId]
                                : 0) || 0;

                        return (
                            <Paper key={p.id} variant="outlined" sx={{ p: 1 }}>
                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 120px 44px", // main | numbers | actions
                                        gridTemplateRows: "auto auto",
                                        gap: 1,
                                        alignItems: "stretch",
                                    }}
                                >
                                    {/* Row 1 col 1: Player */}
                                    <TextField
                                        label="Player"
                                        size="small"
                                        value={p.name}
                                        onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                                        inputProps={{ maxLength: 48 }}
                                        fullWidth
                                    />

                                    {/* Row 1 col 2: You value */}
                                    <TextField
                                        label="You value"
                                        type="number"
                                        size="small"
                                        value={p.senderValue}
                                        onChange={(e) => onUpdate(p.id, { senderValue: numOrZero(e.target.value) })}
                                        inputProps={{ min: 0, step: 1 }}
                                        fullWidth
                                    />

                                    {/* Actions column spans both rows: checkbox top, delete bottom */}
                                    <Stack
                                        sx={{ gridRow: "1 / span 2", gridColumn: 3 }}
                                        alignItems="center"
                                        justifyContent="space-between"
                                    >
                                        <Checkbox
                                            checked={p.enabled}
                                            onChange={(e) => onUpdate(p.id, { enabled: e.target.checked })}
                                            size="small"
                                            sx={{ p: 0.5 }}
                                        />
                                        <IconButton size="small" onClick={() => onDelete(p.id)} sx={{ p: 0.5 }}>
                                            <DeleteRoundedIcon fontSize="small" />
                                        </IconButton>
                                    </Stack>

                                    {/* Row 2 col 1: Send to (with label) */}
                                    <FormControl size="small" fullWidth>
                                        <InputLabel>Send to</InputLabel>
                                        <Select
                                            label="Send to"
                                            value={p.toTeamId}
                                            onChange={(e) => onUpdate(p.id, { toTeamId: e.target.value })}
                                        >
                                            {allTeams.map((t) => (
                                                <MenuItem key={t.id} value={t.id} disabled={t.id === team.id}>
                                                    {t.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    {/* Row 2 col 2: They value */}
                                    <TextField
                                        label="They value"
                                        type="number"
                                        size="small"
                                        value={currentTheyVal}
                                        onChange={(e) =>
                                            onUpdate(p.id, (prev) => ({
                                                ...prev,
                                                receiverValues: {
                                                    ...(prev.receiverValues || {}),
                                                    [prev.toTeamId]: numOrZero(e.target.value),
                                                },
                                            }))
                                        }
                                        inputProps={{ min: 0, step: 1 }}
                                        fullWidth
                                    />
                                </Box>
                            </Paper>
                        );
                    })}

                    {team.players.length === 0 && (
                        <Paper variant="outlined" sx={{ p: 1 }}>
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 2,
                                }}
                            >
                                <Typography variant="body2" color="text.secondary">
                                    No players yet.
                                </Typography>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={onAdd}
                                    startIcon={<AddRoundedIcon />}
                                >
                                    Add player
                                </Button>
                            </Box>
                        </Paper>
                    )}
                </Box>
            ) : (
                // ✅ Desktop/tablet layout (kept)
                <Box sx={{ flex: 1, minHeight: 240, display: "flex", flexDirection: "column" }}>
                    <Table
                        size="small"
                        stickyHeader
                        sx={{
                            "& td, & th": { whiteSpace: "nowrap" },
                        }}
                    >
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 64 }}>Use</TableCell>
                                <TableCell sx={{ minWidth: 120 }}>Player</TableCell>
                                <TableCell align="right" sx={{ width: 120 }}>
                                    You value
                                </TableCell>
                                <TableCell sx={{ width: 170 }}>To</TableCell>
                                <TableCell align="right" sx={{ width: 64 }}>
                                    They value
                                </TableCell>
                                <TableCell align="right" sx={{ width: 72 }}>
                                    Actions
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {team.players.map((p) => {
                                const destId = p.toTeamId;
                                const currentTheyVal =
                                    (p.receiverValues && typeof p.receiverValues[destId] === "number"
                                        ? p.receiverValues[destId]
                                        : 0) || 0;

                                return (
                                    <TableRow key={p.id} hover selected={!p.enabled}>
                                        <TableCell>
                                            <Checkbox
                                                checked={p.enabled}
                                                onChange={(e) => onUpdate(p.id, { enabled: e.target.checked })}
                                            />
                                        </TableCell>

                                        <TableCell>
                                            <TextField
                                                fullWidth
                                                variant="standard"
                                                value={p.name}
                                                onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                                                inputProps={{ maxLength: 48 }}
                                            />
                                        </TableCell>

                                        <TableCell align="right">
                                            <TextField
                                                type="number"
                                                variant="standard"
                                                value={p.senderValue}
                                                onChange={(e) => onUpdate(p.id, { senderValue: numOrZero(e.target.value) })}
                                                inputProps={{ min: 0, step: 1 }}
                                                fullWidth
                                            />
                                        </TableCell>

                                        <TableCell>
                                            <Select
                                                variant="standard"
                                                value={destId}
                                                onChange={(e) => onUpdate(p.id, { toTeamId: e.target.value })}
                                                fullWidth
                                            >
                                                {allTeams.map((t) => (
                                                    <MenuItem key={t.id} value={t.id} disabled={t.id === team.id}>
                                                        {t.name}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </TableCell>

                                        <TableCell align="right">
                                            <Tooltip title={`Value to ${toTeamName(destId)}`}>
                                                <TextField
                                                    type="number"
                                                    variant="standard"
                                                    value={currentTheyVal}
                                                    onChange={(e) =>
                                                        onUpdate(p.id, (prev) => ({
                                                            ...prev,
                                                            receiverValues: {
                                                                ...(prev.receiverValues || {}),
                                                                [prev.toTeamId]: numOrZero(e.target.value),
                                                            },
                                                        }))
                                                    }
                                                    inputProps={{ min: 0, step: 1 }}
                                                    fullWidth
                                                />
                                            </Tooltip>
                                        </TableCell>

                                        <TableCell align="right">
                                            <IconButton size="small" onClick={() => onDelete(p.id)}>
                                                <DeleteRoundedIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                            {team.players.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6}>
                                        <Box
                                            sx={{
                                                py: 2,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 2,
                                            }}
                                        >
                                            <Typography variant="body2" color="text.secondary">
                                                No players yet.
                                            </Typography>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={onAdd}
                                                startIcon={<AddRoundedIcon />}
                                            >
                                                Add player
                                            </Button>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Box>
            )}
        </Paper>
    );
}

// ------------------------------------------------------------
// Summary uses asymmetric values
// ------------------------------------------------------------
function SummaryPanel({ summary, teams }) {
    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
                Trade Summary
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
                Enabled players only. Net = incoming (their value to you) − outgoing (your value).
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                    alignItems: "stretch",
                }}
            >
                {teams.map((t) => (
                    <Paper key={t.id} variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                            <Typography variant="subtitle1" fontWeight={700}>
                                {t.name}
                            </Typography>
                            <Chip
                                label={`Net ${fmt(summary.netByTeam[t.id])}`}
                                color={
                                    summary.netByTeam[t.id] > 0
                                        ? "success"
                                        : summary.netByTeam[t.id] < 0
                                            ? "error"
                                            : "default"
                                }
                            />
                        </Box>

                        <Typography variant="caption" color="text.secondary">
                            Incoming (their value to you)
                        </Typography>
                        <ListLike items={summary.incomingByTeam[t.id]} />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                            Outgoing (your value)
                        </Typography>
                        <ListLike items={summary.outgoingByTeam[t.id]} />
                    </Paper>
                ))}
            </Box>
        </Paper>
    );
}

function ListLike({ items }) {
    if (!items.length) return <Typography variant="body2" color="text.disabled">—</Typography>;
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                rowGap: 0.5,
                columnGap: 1,
                mt: 0.5,
            }}
        >
            {items.map((p) => (
                <React.Fragment key={p.__rowId || p.id}>
                    <Typography variant="body2" noWrap>
                        {p.name}
                    </Typography>
                    <Typography variant="body2" textAlign="right">
                        {fmt(p.value)}
                    </Typography>
                </React.Fragment>
            ))}
        </Box>
    );
}

// ------------------------------------------------------------
// Core logic with asymmetric math
// ------------------------------------------------------------
function computeSummary(teams) {
    const incomingByTeam = {};
    const outgoingByTeam = {};
    const netByTeam = {};

    for (const t of teams) {
        incomingByTeam[t.id] = [];
        outgoingByTeam[t.id] = [];
        netByTeam[t.id] = 0;
    }

    for (const from of teams) {
        for (const p of from.players) {
            if (!p.enabled) continue;
            const to = p.toTeamId;
            if (!to || to === from.id) continue;

            const outgoingVal = numOrZero(p.senderValue);
            outgoingByTeam[from.id].push({
                ...p,
                __rowId: `${p.id}-out-${from.id}`,
                value: outgoingVal,
            });

            const receiverVal =
                (p.receiverValues && typeof p.receiverValues[to] === "number" ? p.receiverValues[to] : 0) || 0;
            if (incomingByTeam[to]) {
                incomingByTeam[to].push({
                    ...p,
                    __rowId: `${p.id}-in-${to}`,
                    value: receiverVal,
                });
            }
        }
    }

    for (const t of teams) {
        const incoming = incomingByTeam[t.id].reduce((a, p) => a + numOrZero(p.value), 0);
        const outgoing = outgoingByTeam[t.id].reduce((a, p) => a + numOrZero(p.value), 0);
        netByTeam[t.id] = incoming - outgoing;
    }

    return { incomingByTeam, outgoingByTeam, netByTeam };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function otherTeamIds(currentId, allTeams) {
    return allTeams.filter((t) => t.id !== currentId).map((t) => t.id);
}

function suggestTeamId(teams) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const existing = new Set(teams.map((t) => t.id));
    for (const L of letters) if (!existing.has(L)) return L;
    return `T${teams.length + 1}`;
}

function numOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
    return (Math.round(n * 100) / 100).toLocaleString();
}
