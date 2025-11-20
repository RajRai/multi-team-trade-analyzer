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
} from "@mui/material";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import GitHubIcon from "@mui/icons-material/GitHub";

// 🔥 Theme Manager imports
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
            // Old schema had: { id, name, value, enabled, toTeamId }
            // New schema: { id, name, senderValue, receiverValues, enabled, toTeamId }
            const senderValue =
                typeof p.senderValue === "number"
                    ? p.senderValue
                    : typeof p.value === "number"
                        ? p.value
                        : 0;
            const receiverValues =
                p.receiverValues && typeof p.receiverValues === "object"
                    ? p.receiverValues
                    : {}; // empty; user fills per destination
            return {
                id: p.id,
                name: p.name ?? "Player",
                senderValue,
                receiverValues,
                enabled: p.enabled !== false,
                toTeamId: p.toTeamId ?? t.id, // default to own team (no trade)
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
// 🔥 FINAL WRAPPED APP (FULL THEME MANAGER INTEGRATION)
// ------------------------------------------------------------
export default function ThemedApp() {
    return (
        <ThemeManagerProvider presets={allPresets}>
            <CssBaseline />
            <ThemeEditorModal />

            {/* Header Controls */}
            <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 2000 }}>
                <Stack direction="row" spacing={1}>
                    <ThemeSelector />
                    <NewThemeButton />
                    <Tooltip title="View on GitHub">
                        <IconButton
                            component="a"
                            href="https://github.com/rajrai/multi-team-trade-analyzer"
                            target="_blank"
                            rel="noopener noreferrer"
                            color="inherit"
                        >
                            <GitHubIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Wrapped "real app" */}
            <AppCore />
        </ThemeManagerProvider>
    );
}

// ------------------------------------------------------------
// 🔥 App with asymmetric values
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
                    receiverValues: { B: 35 }, // worth 35 to B
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
                    receiverValues: { A: 31 }, // worth 31 to A
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
                                receiverValues: {}, // remembered per destination as user edits
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
                t.id === teamId
                    ? { ...t, players: t.players.filter((p) => p.id !== playerId) }
                    : t
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
                        // mutator can be a partial patch or a function
                        if (typeof mutator === "function") return mutator(p);
                        return { ...p, ...mutator };
                    }),
                };
            })
        );

    const summary = useMemo(() => computeSummary(teams), [teams]);

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Header onReset={resetAll} onAddTeam={addTeam} />

            {/* Team cards */}
            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: "1fr", // one full-width card per row
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
// Header
// ------------------------------------------------------------
function Header({ onReset, onAddTeam }) {
    return (
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h5" fontWeight={700}>
                Multi-Team Trade Analyzer
            </Typography>
            <Stack direction="row" spacing={1}>
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
            </Stack>
        </Box>
    );
}

// ------------------------------------------------------------
// Team Editor (with asymmetric values)
// ------------------------------------------------------------
function TeamEditor({ team, allTeams, onSetName, onAdd, onDelete, onUpdate }) {
    const toTeamName = (teamId) => {
        const t = allTeams.find((x) => x.id === teamId);
        return t ? t.name : teamId || "—";
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                width: "100%",
                display: "flex",
                flexDirection: "column",
                height: "100%",
            }}
        >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <TextField
                    label="Team name"
                    value={team.name}
                    onChange={(e) => onSetName(e.target.value)}
                    size="small"
                    inputProps={{ maxLength: 32 }}
                    sx={{ mr: 1, flex: 1 }}
                />
                <Tooltip title="Add player">
                    <IconButton color="primary" onClick={onAdd}>
                        <AddRoundedIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            <Box sx={{ flex: 1, minHeight: 240, display: "flex", flexDirection: "column" }}>
                <Table
                    size="small"
                    stickyHeader
                    sx={{
                        "& td, & th": { whiteSpace: "nowrap" }, // keep things from wrapping badly
                    }}
                >
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: 64 }}>Use</TableCell>
                            <TableCell sx={{ minWidth: 420 /* give name the space */ }}>Player</TableCell>
                            <TableCell align="right" sx={{ width: 120 }}>
                                You value
                            </TableCell>
                            <TableCell sx={{ width: 170 }}>To</TableCell>
                            <TableCell align="right" sx={{ width: 130 }}>
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
                                            onChange={(e) =>
                                                onUpdate(p.id, {
                                                    senderValue: numOrZero(e.target.value),
                                                })
                                            }
                                            inputProps={{ min: 0, step: 1 }}
                                            fullWidth
                                        />
                                    </TableCell>

                                    <TableCell>
                                        <Select
                                            variant="standard"
                                            value={destId}
                                            onChange={(e) => {
                                                const newDest = e.target.value;
                                                onUpdate(p.id, { toTeamId: newDest });
                                            }}
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
            if (!to || to === from.id) continue; // not traded

            // Outgoing: what the sender loses = senderValue
            const outgoingVal = numOrZero(p.senderValue);
            outgoingByTeam[from.id].push({
                ...p,
                __rowId: `${p.id}-out-${from.id}`,
                value: outgoingVal,
            });

            // Incoming: what the receiver gains = receiverValues[to]
            const receiverVal =
                (p.receiverValues && typeof p.receiverValues[to] === "number"
                    ? p.receiverValues[to]
                    : 0) || 0;
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
    // Prefer single letters A..Z then T{n}
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
