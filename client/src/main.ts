import Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene';
import { DiscoveriesScene } from './scenes/DiscoveriesScene';
import { EndScene } from './scenes/EndScene';
import { InventoryScene } from './scenes/InventoryScene';
import { NameScene } from './scenes/NameScene';
import { WorldScene } from './scenes/WorldScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app', // the <div id="app"> in index.html
  width: 800,
  height: 600,
  backgroundColor: '#3b2f2a',
  audio: { noAudio: true },
  dom: { createContainer: true }, // needed for the name <input>
  scene: [BootScene, NameScene, WorldScene, InventoryScene, DiscoveriesScene, EndScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});