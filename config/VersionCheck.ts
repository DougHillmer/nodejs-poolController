/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import * as path from "path";
import * as fs from "fs";
const extend = require("extend");
import { logger } from "../logger/Logger";
// import { https } from "follow-redirects";
import * as https from 'https';
import { state } from "../controller/State";
import { sys } from "../controller/Equipment";
import { Timestamp } from "../controller/Constants";
class VersionCheck {
    private userAgent: string;
    private gitApiHost: string;
    private gitLatestReleaseJSONPath:string; 
    private redirects: number;
    constructor() {
        this.userAgent = 'tagyoureit-nodejs-poolController-app';
        this.gitApiHost = 'api.github.com';
        this.gitLatestReleaseJSONPath = '/repos/tagyoureit/nodejs-poolController/releases/latest';
      }

    public check() {
        // need to significantly rate limit this because GitHub will start to throw 'too many requests' error
        // and we simply don't need to check that often if the app needs to be updated
        if (typeof state.appVersion.nextCheckTime === 'undefined' || new Date() > new Date(state.appVersion.nextCheckTime)) setTimeout(() => {this.checkAll();}, 100);
    }
    private checkAll() {
        try {
            this.redirects = 0;
            let dt = new Date();
            dt.setDate(dt.getDate()+2); // check every 2 days
            state.appVersion.nextCheckTime = Timestamp.toISOLocal(dt); 
            this.getLatestRelease().then((publishedVersion)=>{
                state.appVersion.githubRelease = publishedVersion;
                this.compare();
            });
        }
        catch (err){
            logger.error(err);
        }
    }

    private async getLatestRelease(redirect?:string):Promise<string> {
        var options = { 
            method: 'GET',
            headers: {
                'User-Agent': this.userAgent
            }
        }
        let url: string;
        if (typeof redirect === 'undefined'){
            url = `https://${this.gitApiHost}${this.gitLatestReleaseJSONPath}`;
        }
        else{
            url = redirect;
            this.redirects += 1;
        }
        if (this.redirects >= 20) return Promise.reject(`Too many redirects.`)
                return new Promise((resolve, reject)=> {
            try {
                https.request(url, options, async res => {
                    if (res.statusCode > 300 && res.statusCode < 400 && res.headers.location) await this.getLatestRelease(res.headers.location);
                    let data = '';
                    res.on('data', d => { data += d; });
                    res.on('end', () => {
                        let jdata = JSON.parse(data);
                        if (typeof jdata.tag_name !== 'undefined')
                            resolve(jdata.tag_name.replace('v', ''));
                        else
                            reject(`No data returned.`)
                    })
                })
                .end();
            }
            catch (err) {
                logger.error('Error contacting Github for latest published release: ' + err);
                reject(err);
            };
        })
    }
    public compare() {
        if (typeof state.appVersion.githubRelease === 'undefined' || typeof state.appVersion.installed === 'undefined') {
            state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('unknown');
            return;
        }
        let publishedVersionArr = state.appVersion.githubRelease.split('.');
        let installedVersionArr = state.appVersion.installed.split('.');
        if (installedVersionArr.length !== publishedVersionArr.length) {
            // this is in case local a.b.c doesn't have same # of elements as another version a.b.c.d.  We should never get here.
            logger.warn(`Cannot check for updated app.  Version length of installed app (${installedVersionArr}) and remote (${publishedVersionArr}) do not match.`);
            state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('unknown');
            return;
        } else {
            for (var i = 0; i < installedVersionArr.length; i++) {
                if (publishedVersionArr[i] > installedVersionArr[i]) {
                    state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('behind');
                    return;
                } else if (publishedVersionArr[i] < installedVersionArr[i]) {
                    state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('ahead');
                    return;
                }
            }
        }
        state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('current');
    }
}
export var versionCheck = new VersionCheck();