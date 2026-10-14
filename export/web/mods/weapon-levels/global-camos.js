// The Gunsmith's GLOBAL camo tabs: camos that aren't tied to the gun in the Gunsmith and work on every gun. Add an entry
// to add a tab: {id, label, hint, list({cats}) → camos}. (The gun's own camos are the THIS GUN group: its challenge camos
// and its own three prestige camos.)
import { prestigeCamo } from './camo.js';
import { loadPrestige } from '../prestige/prestige.js';

export const GLOBAL_CAMO_TABS=[
  {id:'prestige',label:'PRESTIGE',hint:'Prestige camos earned on any gun. Every gun has its own three; once one is earned, every gun can wear it.',
    list:()=>loadPrestige().camos.map(id=>prestigeCamo(id)).filter(Boolean)},
  {id:'shop',label:'SHOP',hint:'Bought in the Shop (main menu). Every shop camo works on every gun.',
    list:({cats})=>cats.camos.filter(c=>c.shop)},
  {id:'special',label:'SPECIAL',hint:'Rewards from maps and events.',
    list:({cats})=>cats.camos.filter(c=>c.reward)},
];
