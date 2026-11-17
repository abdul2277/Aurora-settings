// Curated app bundles for the Aurora Store ("one click to set up a PC"). Every id must exist in lib/catalog.js (checked by tests).
const COLLECTIONS = [
  { id: 'essentials', name: 'Everyday essentials', icon: '🌟', desc: 'A browser, a media player, an archiver, a good text editor and PowerToys.', apps: ['Mozilla.Firefox', 'VideoLAN.VLC', '7zip.7zip', 'Notepad++.Notepad++', 'Microsoft.PowerToys'] },
  { id: 'developer', name: 'Developer kit', icon: '🧑‍💻', desc: 'Editor, Git, Python, Node.js and Docker.', apps: ['Microsoft.VisualStudioCode', 'Git.Git', 'Python.Python.3.13', 'OpenJS.NodeJS.LTS', 'Docker.DockerDesktop'] },
  { id: 'creator', name: 'Creator studio', icon: '🎬', desc: 'Record, edit audio and video, paint and 3D.', apps: ['OBSProject.OBSStudio', 'Audacity.Audacity', 'HandBrake.HandBrake', 'GIMP.GIMP', 'BlenderFoundation.Blender'] },
  { id: 'privacy', name: 'Privacy pack', icon: '🛡️', desc: 'Password managers, a private browser, a VPN and an email client.', apps: ['Bitwarden.Bitwarden', 'KeePassXCTeam.KeePassXC', 'TorProject.TorBrowser', 'Proton.ProtonVPN', 'Mozilla.Thunderbird'] },
  { id: 'gamer', name: 'Gamer pack', icon: '🎮', desc: 'Game launchers and chat.', apps: ['Valve.Steam', 'EpicGames.EpicGamesLauncher', 'GOG.Galaxy', 'Playnite.Playnite', 'Telegram.TelegramDesktop'] },
  { id: 'sysadmin', name: 'PC health and tools', icon: '🩺', desc: 'See what is in your PC, check your drives and find big files.', apps: ['CPUID.CPU-Z', 'CrystalDewWorld.CrystalDiskInfo', 'WinDirStat.WinDirStat', 'voidtools.Everything', 'Microsoft.Sysinternals.ProcessExplorer'] }
];
module.exports = { COLLECTIONS };
