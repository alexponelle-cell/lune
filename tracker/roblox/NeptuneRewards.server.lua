--[[
  Neptune : livraison des achats de la boutique fans dans le jeu.

  Installation (par le développeur du jeu) :
    1. Game Settings > Security > « Allow HTTP Requests » : ON
    2. Mettre ce Script dans ServerScriptService (Script serveur, jamais LocalScript)
    3. Remplir API_URL et API_KEY (la même valeur que ROBLOX_API_KEY sur Railway)
    4. Écrire grantReward() : c'est la seule partie propre au jeu

  Fonctionnement : à la connexion d'un joueur puis toutes les 60 s, le jeu demande
  ses achats « à livrer », les donne, puis confirme la livraison.
]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local API_URL = "https://lune-production-dbd1.up.railway.app"
local API_KEY = "COLLE_ICI_LA_CLE"

--[[
  À ADAPTER : donne la récompense au joueur et renvoie true si c'est fait.
  kind = "gamepass" ou "item", ref = la « Référence jeu » saisie dans le dashboard.

  Roblox ne permet pas d'offrir un vrai gamepass : on débloque donc l'avantage
  dans les données du jeu (DataStore), exactement comme si le joueur l'avait acheté.
  Doit être sans effet si l'objet est déjà débloqué (en cas de nouvelle tentative).
]]
local function grantReward(player, kind, ref, name)
	-- Exemple : PlayerData.Unlock(player, ref)
	warn(("[Neptune] grantReward à implémenter : %s %s (%s) pour %s"):format(kind, ref, name, player.Name))
	return false
end

local function request(method, path, body)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = API_URL .. path,
			Method = method,
			Headers = { ["x-api-key"] = API_KEY, ["Content-Type"] = "application/json" },
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		warn("[Neptune] requête impossible :", res)
		return nil
	end
	if not res.Success then
		warn("[Neptune] HTTP", res.StatusCode, res.Body)
		return nil
	end
	return HttpService:JSONDecode(res.Body)
end

local busy = {}

local function sync(player)
	if busy[player] then return end
	busy[player] = true
	local data = request("GET", "/api/roblox/pending?userId=" .. player.UserId)
	if data and data.orders then
		local delivered = {}
		for _, order in ipairs(data.orders) do
			local ok, granted = pcall(grantReward, player, order.kind, order.ref, order.name)
			if ok and granted then
				table.insert(delivered, order.id)
			elseif not ok then
				warn("[Neptune] erreur grantReward :", granted)
			end
		end
		if #delivered > 0 then
			request("POST", "/api/roblox/delivered", { userId = player.UserId, orderIds = delivered })
		end
	end
	busy[player] = nil
end

Players.PlayerAdded:Connect(sync)
Players.PlayerRemoving:Connect(function(player)
	busy[player] = nil
end)

task.spawn(function()
	while true do
		task.wait(60)
		for _, player in ipairs(Players:GetPlayers()) do
			task.spawn(sync, player)
		end
	end
end)
