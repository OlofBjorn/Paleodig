import Phaser from 'phaser';
import './style.css';
import { DigScene } from './scenes/digScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app', // the <div id="app"> in index.html
  width: 800,
  height: 600,
  backgroundColor: '#3b2f2a',
  scene: [DigScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});