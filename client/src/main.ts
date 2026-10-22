import Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene';
import { DigScene } from './scenes/digScene';
import { NameScene } from './scenes/NameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app', // the <div id="app"> in index.html
  width: 800,
  height: 600,
  backgroundColor: '#3b2f2a',
  dom: { createContainer: true }, // needed for the name <input>
  scene: [BootScene, NameScene, DigScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});