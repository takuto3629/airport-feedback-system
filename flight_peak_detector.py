#!/usr/bin/env python3
"""
航班高峰时段检测器 v2
=====================
适配真实CSV格式：GB2312编码、计达格式0845(05)、无人数列
用法：python3 flight_peak_detector.py -f WUH航班计划.csv
"""

import csv, json, sys, re, argparse, io
from datetime import datetime, timedelta

# ── 机型 → 预估人数 ──
AIRCRAFT_PAX = {
    "A388":500,"A380":500,"B77W":350,"B773":350,"B772":300,
    "B789":290,"B788":240,"A359":300,"A350":300,"A333":280,
    "A332":250,"A330":260,"A321":220,"A21N":220,
    "B738":164,"B38M":176,"B737":140,"B73G":140,"B736":110,
    "A320":158,"A20N":180,"A319":140,"A19N":140,
    "E195":120,"E190":100,"E175":76,"E170":72,
    "CRJ9":90,"CRJ7":70,"CRJ2":50,"ARJ2":90,"MA60":52,"AT76":70,
}

def estimate_pax(aircraft: str) -> int:
    if not aircraft:
        return 150
    key = aircraft.strip().upper()
    if key in AIRCRAFT_PAX:
        return AIRCRAFT_PAX[key]
    for k, v in AIRCRAFT_PAX.items():
        if key.startswith(k) or k.startswith(key):
            return v
    return 150

def parse_arrival(raw: str) -> int:
    """解析计达字段为分钟数。支持 '0845(05)', '0845', '08:45', 845 等格式"""
    s = str(raw).strip()
    m = re.match(r"(\d{2})(\d{2})", s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    if ":" in s:
        parts = s.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    try:
        n = int(s)
        return (n // 100) * 60 + (n % 100)
    except:
        return -1

def fmt_time(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"

# ── CSV加载（自动检测编码和表头位置）──
def load_csv(filepath: str):
    # Try encodings
    raw = open(filepath, "rb").read()
    text = None
    for enc in ["utf-8-sig", "utf-8", "gb18030", "gbk", "gb2312", "latin1"]:
        try:
            text = raw.decode(enc)
            if "航班" in text or "flight" in text.lower():
                break
        except:
            continue
    if text is None:
        print("❌ 无法解码文件", file=sys.stderr)
        return [], "", False

    lines = text.strip().split("\n")
    sep = "\t" if "\t" in lines[0] else ","

    # Find header row
    header_idx = -1
    for i, line in enumerate(lines[:10]):
        if "航班号" in line and "计达" in line:
            header_idx = i
            break
    if header_idx == -1:
        print("❌ 找不到表头行（需包含'航班号'和'计达'）", file=sys.stderr)
        return [], "", False

    headers = [h.strip().strip('"').strip("'") for h in lines[header_idx].split(sep)]

    def find_col(keywords):
        for kw in keywords:
            for idx, h in enumerate(headers):
                if kw in h:
                    return idx
        return -1

    col_arrival = find_col(["计达", "到达", "arrival"])
    col_flight  = find_col(["航班号", "航班", "flight"])
    col_origin  = find_col(["出发地", "始发", "origin"])
    col_aircraft= find_col(["机型", "aircraft"])
    col_pax     = find_col(["预估人数", "人数", "旅客", "pax"])
    col_regno   = find_col(["机号", "注册号"])

    has_pax = col_pax != -1
    if not has_pax:
        print("ℹ️  CSV无「预估人数」列，将根据机型自动估算", file=sys.stderr)

    flights = []
    for i in range(header_idx + 1, len(lines)):
        vals = [v.strip().strip('"').strip("'") for v in lines[i].split(sep)]
        if len(vals) < 2 or all(not v for v in vals):
            continue

        arrival_raw = vals[col_arrival] if col_arrival >= 0 else ""
        if not arrival_raw:
            continue

        mins = parse_arrival(arrival_raw)
        if mins < 0:
            print(f"⚠️  第{i+1}行到达时间无法解析: {arrival_raw}", file=sys.stderr)
            continue

        aircraft = vals[col_aircraft] if col_aircraft >= 0 else ""
        pax = int(vals[col_pax]) if has_pax and col_pax < len(vals) and vals[col_pax].isdigit() else estimate_pax(aircraft)

        flights.append({
            "mins": mins,
            "flight": vals[col_flight] if col_flight >= 0 else "",
            "origin": vals[col_origin] if col_origin >= 0 else "",
            "aircraft": aircraft,
            "regno": vals[col_regno] if col_regno >= 0 and col_regno < len(vals) else "",
            "pax": pax,
            "pax_estimated": not has_pax,
        })

    # Extract date from filename
    date_str = ""
    dm = re.search(r"(\d{4})[年\-](\d{1,2})[月\-](\d{1,2})", filepath)
    if dm:
        date_str = f"{dm.group(1)}-{dm.group(2).zfill(2)}-{dm.group(3).zfill(2)}"

    return flights, date_str, has_pax


# ── 滑动窗口检测 ──
def detect_peaks(flights, window_minutes=30, min_flights=5):
    sorted_f = sorted(flights, key=lambda f: f["mins"])
    peaks = []

    for i in range(len(sorted_f)):
        start = sorted_f[i]["mins"]
        end = start + window_minutes
        group = []
        for j in range(i, len(sorted_f)):
            if sorted_f[j]["mins"] <= end:
                group.append(sorted_f[j])
            else:
                break

        if len(group) >= min_flights:
            if peaks:
                last = peaks[-1]
                last_flights = {f["flight"] for f in last["flights"]}
                curr_flights = {f["flight"] for f in group}
                overlap = len(last_flights & curr_flights)
                if overlap > len(curr_flights) * 0.3:
                    # Merge
                    all_map = {f["flight"]: f for f in last["flights"]}
                    for f in group:
                        all_map[f["flight"]] = f
                    all_f = sorted(all_map.values(), key=lambda f: f["mins"])
                    peaks[-1] = {
                        "start": all_f[0]["mins"],
                        "end": all_f[-1]["mins"],
                        "flights": all_f,
                        "count": len(all_f),
                        "total_pax": sum(f["pax"] for f in all_f),
                    }
                    continue
            peaks.append({
                "start": group[0]["mins"],
                "end": group[-1]["mins"],
                "flights": group,
                "count": len(group),
                "total_pax": sum(f["pax"] for f in group),
            })
    return peaks


# ── 输出格式化 ──
def format_alert(peaks, date_str, total, has_pax):
    if not peaks:
        return f"📋 {date_str} 航班调度预警：无高峰时段"

    pax_mark = "" if has_pax else "约"
    lines = [
        f"🚨 航班到达高峰预警",
        f"📅 日期：{date_str}  📊 总航班：{total}班",
        "━" * 20,
    ]
    for i, p in enumerate(peaks, 1):
        lines.append("")
        lines.append(f"⏰ 高峰{i}：{fmt_time(p['start'])} ~ {fmt_time(p['end'])}")
        lines.append(f"   {p['count']}班 / {pax_mark}{p['total_pax']}人")
        lines.append(f"   ┌{'─'*29}┐")
        for f in p["flights"]:
            pm = "~" if f["pax_estimated"] else ""
            lines.append(
                f"   │ {fmt_time(f['mins'])}  {f['flight']:<9s} "
                f"{f['origin']:<6s} {f['aircraft']:<5s} {pm}{f['pax']:>3d}人 │"
            )
        lines.append(f"   └{'─'*29}┘")

    lines.append("")
    if not has_pax:
        lines.append("⚠️ 人数为机型预估值，仅供参考")
    lines.append(f"共 {len(peaks)} 个高峰时段，请提前安排保障资源。")
    return "\n".join(lines)


# ── 钉钉推送 ──
def send_dingtalk(webhook_url, text, keyword="预警"):
    import urllib.request
    content = f"[{keyword}] {text}" if keyword else text
    payload = json.dumps({
        "msgtype": "text",
        "text": {"content": content},
        "at": {"isAtAll": False},
    }).encode("utf-8")

    req = urllib.request.Request(
        webhook_url, data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            if result.get("errcode") == 0:
                print("✅ 钉钉推送成功")
            else:
                print(f"❌ 钉钉推送失败: {result}")
    except Exception as e:
        print(f"❌ 推送异常: {e}")


# ── 主程序 ──
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="航班高峰时段检测器 v2")
    parser.add_argument("-f", "--file", required=True, help="CSV文件路径")
    parser.add_argument("-w", "--window", type=int, default=30, help="窗口大小(分钟)")
    parser.add_argument("-t", "--threshold", type=int, default=5, help="触发阈值(航班数)")
    parser.add_argument("--webhook", help="钉钉Webhook地址")
    parser.add_argument("--keyword", default="预警", help="钉钉安全关键词")
    parser.add_argument("--json", action="store_true", help="输出JSON格式")
    args = parser.parse_args()

    flights, date_str, has_pax = load_csv(args.file)
    if not flights:
        print("❌ 未读取到有效航班数据")
        sys.exit(1)

    print(f"📊 读取 {len(flights)} 个航班 | 日期: {date_str} | 窗口: {args.window}分钟 | 阈值: ≥{args.threshold}班\n")

    peaks = detect_peaks(flights, args.window, args.threshold)
    alert = format_alert(peaks, date_str, len(flights), has_pax)
    print(alert)

    if args.json:
        print("\n--- JSON ---")
        out = []
        for p in peaks:
            out.append({
                "start": fmt_time(p["start"]), "end": fmt_time(p["end"]),
                "count": p["count"], "total_pax": p["total_pax"],
                "flights": [{"time": fmt_time(f["mins"]), "flight": f["flight"],
                             "origin": f["origin"], "aircraft": f["aircraft"],
                             "pax": f["pax"]} for f in p["flights"]],
            })
        print(json.dumps(out, ensure_ascii=False, indent=2))

    if args.webhook:
        send_dingtalk(args.webhook, alert, args.keyword)
